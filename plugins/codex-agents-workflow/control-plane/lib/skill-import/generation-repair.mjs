import { requireValue } from '../workflow-paths.mjs';
import { digest, canonicalJSON } from '../workflow-revisions.mjs';
import { advanceRun } from '../workflow-state.mjs';

// Only closed, read-only Skill planning rounds may be rewound. This is not a
// general Workflow retry: all previous attempts and their artifacts stay intact.
export async function repairGeneration(runtime,args,record,feedback,{reviewOnly=false}={}) {
  const {state,pins,sequence}=record;
  const policy=pins.generation?.settings;
  requireValue(policy && pins.root.provenance.kind==='skill_expansion_job','GENERATION_REPAIR_DISABLED','This Run has no pinned automatic repair policy');
  if ((!reviewOnly && state.nodes.expand.attempts.length>=policy.max_rounds) || state.nodes.final.attempts.length>=policy.max_rounds) return {phase:'attention',error:{code:'GENERATION_REPAIR_LIMIT',message:'自动修正已达到轮数上限，保留全部结果供检查。'},feedback};
  requireValue(Buffer.byteLength(canonicalJSON(feedback))<=100000,'GENERATION_FEEDBACK_LIMIT','Repair feedback exceeds its bounded limit');
  await runtime.transition(args.run_id,'generation_repair',(current,definition)=>{
    requireValue(current.control_hash===digest(args.control_token),'RUN_AUTHORITY','Invalid generation controller');
    requireValue(['running','failed'].includes(current.status),'GENERATION_REPAIR_STATE','Stopped or paused generation cannot restart');
    requireValue(current.permissions.access==='read_only' && definition.root.workflow.nodes.filter(n=>n.executor).every(n=>n.access==='read_only'),'GENERATION_REPAIR_SCOPE','Only read-only planning can repair automatically');
    for (const id of (reviewOnly?['final']:['expand','final'])) {
      const node=current.nodes[id];
      const attempt=node.attempts.find(a=>a.id===node.active_attempt_id);
      if(attempt?.dispatch) requireValue(attempt.executor_events?.some(e=>e.kind==='session_state' && e.metadata.status==='closed') && !attempt.dispatch.cancellation_pending,'GENERATION_REPAIR_ACTIVE','Previous model session must be closed before repair');
      if(attempt && ['claimed','running'].includes(attempt.status)) {attempt.status='failed';attempt.error={code:'GENERATION_REVIEW_REJECTED',message:'Review requested a corrected proposal'};attempt.finished_at=new Date().toISOString();}
      node.status='pending';node.active_attempt_id=null;node.output=null;node.error=null;node.failure_handled=false;node.approval_id=null;node.approval_round++;
    }
    current.nodes.end.status='pending';current.output=null;current.error=null;current.status='running';
    if(reviewOnly) { for(const edge of definition.root.workflow.edges) if(edge.source==='final') current.edges[edge.id]='pending'; }
    else current.edges=Object.fromEntries(definition.root.workflow.edges.map(e=>[e.id,e.source==='start'?'selected':'pending']));
    current.generation_repair={round:current.nodes.expand.attempts.length+(reviewOnly?0:1),feedback,previous_proposal:state.nodes.expand.output};
    advanceRun(current,definition);current.updated_at=new Date().toISOString();
  },{expected_sequence:sequence});
  return {phase:'repairing',review_only:reviewOnly,round:state.nodes.expand.attempts.length+(reviewOnly?0:1),feedback};
}
