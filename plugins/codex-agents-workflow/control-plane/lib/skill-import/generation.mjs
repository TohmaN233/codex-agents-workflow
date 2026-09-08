import { repairGeneration } from './generation-repair.mjs';
import { generationProgress } from './generation-progress.mjs';
import { compileExpansion } from './semantic-expander.mjs';
import { leaseToken } from '../workflow-execution-envelope.mjs';
import { requireValue } from '../workflow-paths.mjs';

// One bounded transition per request. Only pinned read-only generation repairs
// may retry; human final acceptance remains explicit.
export async function advanceGeneration(service, runtime, executor, args, {store,context}) {
  await runtime.authorizeController(args.run_id,args);
  const record = await runtime.runs.read(args.run_id);
  const {state,pins} = record;
  requireValue(pins.root.provenance?.kind === 'skill_expansion_job', 'GENERATION_RUN', 'Generation requires a pinned Skill expansion Run');
  const source = {workflow_id:pins.root.provenance.source_workflow_id,expected_revision:pins.root.provenance.source_revision};
  if (state.status === 'succeeded') return {phase:'ready_to_apply',source};
  if (state.status==='blocked') {const next=await runtime.next(args.run_id);if(next.approvals.length) return {phase:'approval',approvals:next.approvals};}
  if (state.status !== 'running') {
    const failed = Object.values(state.nodes).find(n=>n.status==='failed');
    if (state.status==='failed' && pins.generation?.settings && ['STRICT_OUTPUT_JSON','DATA_INVALID'].includes(failed?.error?.code)) return repairGeneration(runtime,args,record,{code:failed.error.code,message:'Return valid JSON matching the exact schema.'});
    const error=failed?.error ?? state.error;
    return {phase:'attention',status:state.status,error,models:pins.generation?.settings,diagnostics:failed?.attempts.at(-1)?.executor_events?.filter(e=>['model_catalog','session_state'].includes(e.kind))};
  }
  const next = await runtime.next(args.run_id);
  if (next.approvals.length) return {phase:'approval',approvals:next.approvals};
  for (const nodeId of ['expand','final']) {
    const node = state.nodes[nodeId];
    requireValue(node, 'GENERATION_RUN', 'Expansion Run is missing a required stage');
    if (node.status === 'succeeded') continue;
    if (node.status === 'ready') {
      if(nodeId==='final' && pins.generation?.settings) {
        const pack=await store.snapshot(source.workflow_id,source.expected_revision);
        const resources=await store.resources(source.workflow_id,pack.revision_hash);
        try {compileExpansion(pack,resources,state.nodes.expand.output,{...context,routing_rules:pins.root.provenance.routing_rules,routing_catalog:pins.root.provenance.routing_catalog});}
        catch(error){if(!error.code?.startsWith('EXPANSION_') && !['DATA_INVALID','ROUTING_CLASSIFICATION'].includes(error.code)) throw error;return repairGeneration(runtime,args,record,{code:error.code,message:error.message,validation:error.validation ?? null});}
      }
      const lease = await runtime.claimNode(args.run_id,{...args,node_id:nodeId,owner:state.main_actor,request_id:'generation-'+nodeId+'-'+node.attempts.length});
      await executor.dispatch(args.run_id,{...args,node_id:nodeId,attempt_id:lease.attempt_id,lease_token:lease.lease_token});
      return {phase:nodeId==='expand'?'generating':'reviewing',progress:generationProgress(await runtime.runs.read(args.run_id),nodeId)};
    }
    const attempt = node.attempts.find(a=>a.id===node.active_attempt_id);
    if (!attempt || !['claimed','running'].includes(node.status)) return {phase:'attention',status:node.status,error:node.error};
    const lease = {...args,node_id:nodeId,attempt_id:attempt.id,lease_token:leaseToken(args.control_token,args.run_id,nodeId,attempt.id,attempt.lease_generation ?? 0)};
    if (!attempt.dispatch) {
      await executor.dispatch(args.run_id,lease);
      return {phase:nodeId==='expand'?'generating':'reviewing',progress:generationProgress(await runtime.runs.read(args.run_id),nodeId)};
    }
    if (nodeId==='final' && attempt.result_proposal) {
      const result = await service.strictManager.collect(runtime,args.run_id,{...lease,accepted:false});
      const review=result.completion.structured_output;
      if(pins.generation?.settings && (review.approved!==true || review.findings.length)) return repairGeneration(runtime,args,record,{code:'GENERATION_REVIEW_FINDINGS',findings:review.findings});
      const pack = await store.snapshot(source.workflow_id,source.expected_revision);
      const resources = await store.resources(source.workflow_id,pack.revision_hash);
      const compiled = compileExpansion(pack,resources,state.nodes.expand.output,{...context,routing_rules:pins.root.provenance.routing_rules,routing_catalog:pins.root.provenance.routing_catalog});
      return {phase:'review_required',source,proposal:state.nodes.expand.output,workflow:compiled.workflow,validation:compiled.validation,review:result.completion};
    }
    const live = await service.strictManager.status(runtime,args.run_id,lease);
    return {phase:['auth_required','auth_pending'].includes(live.status)?'authentication_required':nodeId==='expand'?'generating':'reviewing',live,progress:generationProgress(record,nodeId)};
  }
  return {phase:'attention',status:state.status};
}

export async function acceptGeneration(service, runtime, args) {
  requireValue(args.accepted === true,'GENERATION_ACCEPTANCE','Review and explicitly accept the proposed graph first');
  await runtime.authorizeController(args.run_id,args);
  const record = await runtime.runs.read(args.run_id);
  const provenance = record.pins.root.provenance;
  requireValue(provenance?.kind === 'skill_expansion_job','GENERATION_RUN','Not a Skill expansion Run');
  const pending = record.state.nodes.final?.attempts.find(a=>a.id===record.state.nodes.final.active_attempt_id);
  requireValue(record.state.status === 'succeeded' || (record.state.status === 'running' && pending?.result_proposal), 'GENERATION_NOT_READY', 'Generation is not ready for acceptance');
  const observation = {phase:record.state.status==='succeeded'?'ready_to_apply':'review_required', source:{workflow_id:provenance.source_workflow_id,expected_revision:provenance.source_revision}};
  if (observation.phase==='review_required') {
    const {state} = await runtime.runs.read(args.run_id);
    const attempt = state.nodes.final.attempts.find(a=>a.id===state.nodes.final.active_attempt_id);
    if(record.pins.generation) {const completion=await runtime.runs.readExecutorResult(args.run_id,attempt.id,attempt.result_proposal.sha256);requireValue(completion.structured_output.approved===true && completion.structured_output.findings.length===0,'GENERATION_REVIEW_BLOCKED','Review must pass before acceptance');}
    await service.strictManager.collect(runtime,args.run_id,{...args,node_id:'final',attempt_id:attempt.id,lease_token:leaseToken(args.control_token,args.run_id,'final',attempt.id,attempt.lease_generation ?? 0),accepted:true});
  }
  return service.call('apply_expansion_result',{...args,...observation.source,confirm_inferences:true},{human:true});
}

export async function loginGeneration(service,runtime,args) {
  await runtime.authorizeController(args.run_id,args);
  const {state,pins}=await runtime.runs.read(args.run_id);
  requireValue(pins.root.provenance?.kind==='skill_expansion_job' && state.status==='running','GENERATION_RUN','Login requires an active Skill generation Run');
  const nodeId=['expand','final'].find(id=>state.nodes[id] && ['claimed','running'].includes(state.nodes[id].status));
  const node=state.nodes[nodeId];
  const attempt=node?.attempts.find(a=>a.id===node.active_attempt_id);
  requireValue(attempt?.dispatch,'GENERATION_NOT_READY','No active generation session');
  return service.strictManager.login(runtime,args.run_id,{...args,node_id:nodeId,attempt_id:attempt.id,lease_token:leaseToken(args.control_token,args.run_id,nodeId,attempt.id,attempt.lease_generation ?? 0)});
}
