import { requireValue } from '../workflow-paths.mjs';
import { digest, canonicalJSON } from '../workflow-revisions.mjs';
import { advanceRun } from '../workflow-state.mjs';
import { decodeGeneratedEnvelope, decodeGeneratedProposal } from './expansion-run.mjs';
import { SEMANTIC_BLUEPRINT_CONTRACT } from '../authoring/blueprint-contract.mjs';
import { MAX_PLANNER_ATTEMPTS } from './generation-retry-policy.mjs';
import { isAuthoringRunProvenance } from '../authoring/authoring-workflows.mjs';

function feedbackIssues(feedback) {
  if (!feedback || typeof feedback !== 'object') return [];
  const issues=[];
  if (Array.isArray(feedback.findings)) issues.push(...feedback.findings);
  if (Array.isArray(feedback.validation)) issues.push(...feedback.validation);
  if (Array.isArray(feedback.validation?.errors)) issues.push(...feedback.validation.errors);
  return [...new Set(issues.map(issue=>canonicalJSON(issue)))].sort();
}

// Only closed, read-only Skill planning rounds may be rewound. This is not a
// general Workflow retry: all previous attempts and their artifacts stay intact.
export async function repairGeneration(runtime,args,record,feedback,{reviewOnly=false}={}) {
  const {state,pins,sequence}=record;
  const policy=pins.generation?.settings;
  requireValue(policy && isAuthoringRunProvenance(pins.root.provenance),'GENERATION_REPAIR_DISABLED','This Run has no pinned automatic repair policy');
  if (state.generation_repair?.feedback && canonicalJSON(state.generation_repair.feedback) === canonicalJSON(feedback)) {
    return {phase:'attention',error:{code:'GENERATION_REPAIR_STALLED',message:'自动修正再次产生了相同失败；停止继续消耗轮次并保留结果供检查。'},feedback};
  }
  const previousFeedback=state.generation_repair?.feedback;
  const previousIssues=feedbackIssues(previousFeedback), currentIssues=feedbackIssues(feedback);
  if (previousFeedback?.code === feedback?.code && previousIssues.length && previousIssues.every(issue=>currentIssues.includes(issue))) {
    return {phase:'attention',error:{code:'GENERATION_REPAIR_STALLED',message:'自动修正保留了全部既有问题；停止继续消耗轮次并保留结果供检查。'},feedback,progress:{previous:previousIssues.length,current:currentIssues.length}};
  }
  if (reviewOnly || state.nodes.expand.attempts.length>=Math.min(policy.max_rounds,MAX_PLANNER_ATTEMPTS)) return {phase:'attention',error:{code:reviewOnly?'GENERATION_REVIEW_PROTOCOL':'GENERATION_REPAIR_LIMIT',message:reviewOnly?'审阅输出不符合协议；机械协议错误不会消耗语义修订轮次。':'唯一一次语义修订已用完，保留全部结果供检查。'},feedback};
  requireValue(Buffer.byteLength(canonicalJSON(feedback))<=100000,'GENERATION_FEEDBACK_LIMIT','Repair feedback exceeds its bounded limit');
  await runtime.transition(args.run_id,'generation_repair',(current,definition)=>{
    requireValue(current.control_hash===digest(args.control_token),'RUN_AUTHORITY','Invalid generation controller');
    requireValue(['running','failed'].includes(current.status),'GENERATION_REPAIR_STATE','Stopped or paused generation cannot restart');
    requireValue(current.permissions.access==='read_only' && definition.root.workflow.nodes.filter(n=>n.executor).every(n=>n.access==='read_only'),'GENERATION_REPAIR_SCOPE','Only read-only planning can repair automatically');
    for (const id of (reviewOnly?['final']:['expand','final'])) {
      const node=current.nodes[id];
      const attempt=node.attempts.find(a=>a.id===node.active_attempt_id);
      if(attempt?.dispatch) {
        const modelClosed=attempt.executor_events?.some(e=>e.kind==='session_state' && e.metadata.status==='closed');
        const hostReplayClosed=attempt.status==='succeeded' && attempt.dispatch.receipt?.executor==='host-generation-replay';
        requireValue((modelClosed || hostReplayClosed) && !attempt.dispatch.cancellation_pending,'GENERATION_REPAIR_ACTIVE','Previous model session or host replay must be closed before repair');
      }
      if(attempt && ['claimed','running'].includes(attempt.status)) {attempt.status='failed';attempt.error={code:'GENERATION_REVIEW_REJECTED',message:'Review requested a corrected proposal'};attempt.finished_at=new Date().toISOString();}
      node.status='pending';node.active_attempt_id=null;node.output=null;node.error=null;node.failure_handled=false;node.approval_id=null;node.approval_round++;
    }
    current.nodes.end.status='pending';current.output=null;current.error=null;current.status='running';
    if(reviewOnly) { for(const edge of definition.root.workflow.edges) if(edge.source==='final') current.edges[edge.id]='pending'; }
    else current.edges=Object.fromEntries(definition.root.workflow.edges.map(e=>[e.id,e.source==='start'?'selected':'pending']));
    let previousProposal=state.generation_projection?.authoring_plan ? structuredClone(state.generation_projection.authoring_plan) : null,previousDecodeError=null;
    if(!previousProposal && state.nodes.expand.output)try{const payload=decodeGeneratedEnvelope(state.nodes.expand.output);previousProposal=payload?.contract===SEMANTIC_BLUEPRINT_CONTRACT?payload:decodeGeneratedProposal(state.nodes.expand.output,pins.root.provenance.source_revision,{requirePlanningAnalysis:pins.root.provenance.routing_rules?.selection_mode === 'automatic',requireSourceDispositions:(pins.root.provenance.review_contract_version ?? 1)>=8});}
    catch(error){previousDecodeError={code:error.code ?? 'GENERATION_PROPOSAL_INVALID',message:error.message,raw_output_hash:digest(canonicalJSON(state.nodes.expand.output))};}
    current.generation_repair={round:current.nodes.expand.attempts.length+(reviewOnly?0:1),feedback,previous_proposal:previousProposal,...(previousDecodeError?{previous_decode_error:previousDecodeError}:{})};
    advanceRun(current,definition);current.updated_at=new Date().toISOString();
  },{expected_sequence:sequence});
  return {phase:'repairing',review_only:reviewOnly,round:state.nodes.expand.attempts.length+(reviewOnly?0:1),feedback};
}
