import { compileExpansion } from './semantic-expander.mjs';
import { leaseToken } from '../workflow-execution-envelope.mjs';
import { requireValue } from '../workflow-paths.mjs';

// One bounded transition per request; never retry failed nodes or accept a final
// model proposal automatically. Durable Run state remains the single authority.
export async function advanceGeneration(service, runtime, executor, args, {store,context}) {
  await runtime.authorizeController(args.run_id,args);
  const {state,pins} = await runtime.runs.read(args.run_id);
  requireValue(pins.root.provenance?.kind === 'skill_expansion_job', 'GENERATION_RUN', 'Generation requires a pinned Skill expansion Run');
  const source = {workflow_id:pins.root.provenance.source_workflow_id,expected_revision:pins.root.provenance.source_revision};
  if (state.status === 'succeeded') return {phase:'ready_to_apply',source};
  if (state.status !== 'running') return {phase:'attention',status:state.status,error:state.error};
  const next = await runtime.next(args.run_id);
  if (next.approvals.length) return {phase:'approval',approvals:next.approvals};
  for (const nodeId of ['expand','final']) {
    const node = state.nodes[nodeId];
    requireValue(node, 'GENERATION_RUN', 'Expansion Run is missing a required stage');
    if (node.status === 'succeeded') continue;
    if (node.status === 'ready') {
      const lease = await runtime.claimNode(args.run_id,{...args,node_id:nodeId,owner:state.main_actor,request_id:'generation-'+nodeId});
      await executor.dispatch(args.run_id,{...args,node_id:nodeId,attempt_id:lease.attempt_id,lease_token:lease.lease_token});
      return {phase:nodeId==='expand'?'generating':'reviewing'};
    }
    const attempt = node.attempts.find(a=>a.id===node.active_attempt_id);
    if (!attempt || !['claimed','running'].includes(node.status)) return {phase:'attention',status:node.status,error:node.error};
    const lease = {...args,node_id:nodeId,attempt_id:attempt.id,lease_token:leaseToken(args.control_token,args.run_id,nodeId,attempt.id,attempt.lease_generation ?? 0)};
    if (!attempt.dispatch) {
      await executor.dispatch(args.run_id,lease);
      return {phase:nodeId==='expand'?'generating':'reviewing'};
    }
    if (nodeId==='final' && attempt.result_proposal) {
      const result = await service.strictManager.collect(runtime,args.run_id,{...lease,accepted:false});
      const pack = await store.snapshot(source.workflow_id,source.expected_revision);
      const resources = await store.resources(source.workflow_id,pack.revision_hash);
      const compiled = compileExpansion(pack,resources,state.nodes.expand.output,{...context,routing_rules:pins.root.provenance.routing_rules});
      return {phase:'review_required',source,proposal:state.nodes.expand.output,workflow:compiled.workflow,validation:compiled.validation,review:result.completion};
    }
    const live = await service.strictManager.status(runtime,args.run_id,lease);
    return {phase:['auth_required','auth_pending'].includes(live.status)?'authentication_required':nodeId==='expand'?'generating':'reviewing',live};
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
    await service.strictManager.collect(runtime,args.run_id,{...args,node_id:'final',attempt_id:attempt.id,lease_token:leaseToken(args.control_token,args.run_id,'final',attempt.id,attempt.lease_generation ?? 0),accepted:true});
  }
  return service.call('apply_expansion_result',{...args,...observation.source});
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
