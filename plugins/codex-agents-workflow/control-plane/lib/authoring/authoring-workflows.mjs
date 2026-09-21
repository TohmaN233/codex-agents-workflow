import { createDraft } from '../workflow-schema.mjs';
import { requireValue } from '../workflow-paths.mjs';
import { SEMANTIC_BLUEPRINT_CONTRACT, SEMANTIC_REPAIR_CONTRACT } from './blueprint-contract.mjs';
import { MAX_PLANNER_ATTEMPTS } from '../skill-import/generation-retry-policy.mjs';

const stages=Object.freeze([
  Object.freeze({id:'source_snapshot',owner:'host',kind:'source_adapter'}),
  Object.freeze({id:'expand',owner:'planner',kind:'semantic_plan'}),
  Object.freeze({id:'compile_candidate',owner:'host',kind:'deterministic_compile'}),
  Object.freeze({id:'final',owner:'reviewer',kind:'semantic_review'}),
  Object.freeze({id:'semantic_repair',owner:'planner',kind:'semantic_delta',maximum:1}),
  Object.freeze({id:'publish',owner:'human',kind:'explicit_acceptance'}),
]);
const stageEdges=Object.freeze([['source_snapshot','expand'],['expand','compile_candidate'],['compile_candidate','final'],['final','semantic_repair'],['semantic_repair','compile_candidate'],['final','publish']].map(([source,target])=>Object.freeze({source,target})));
const shared=Object.freeze({
  contract:'codex-authoring-workflow/v1',
  pipeline:'host-source-adapter -> semantic-planner -> host-compiler -> semantic-review -> human-publish',
  semantic_contract:SEMANTIC_BLUEPRINT_CONTRACT,
  repair_contract:SEMANTIC_REPAIR_CONTRACT,
  mechanical_owner:'host',
  planner_attempts:MAX_PLANNER_ATTEMPTS,
  semantic_repairs:MAX_PLANNER_ATTEMPTS-1,
  mechanical_repairs:0,
  configurable_slots:Object.freeze(['planner_provider_id','review_provider_id','routing_rules','max_rounds']),
  stages,
  edges:stageEdges,
});

export const AUTHORING_WORKFLOWS=Object.freeze([
  Object.freeze({id:'system.skill2workflow',name:'Skill to Workflow',source_kind:'skill',source_adapter:'skill_snapshot',seed_operation:'import_skill',...shared}),
  Object.freeze({id:'system.build-workflow',name:'Build Workflow',source_kind:'brief',source_adapter:'brief_snapshot',seed_operation:'build_workflow',...shared}),
]);

export function authoringWorkflow(id){
  const definition=AUTHORING_WORKFLOWS.find(item=>item.id===id);
  requireValue(definition,'AUTHORING_WORKFLOW_MISSING',`Unknown authoring Workflow ${id}`);
  return definition;
}

export function authoringWorkflowForPack(pack){
  const sourceKind=pack?.provenance?.source_kind==='brief' || pack?.provenance?.kind==='workflow_build'?'brief':'skill';
  return AUTHORING_WORKFLOWS.find(item=>item.source_kind===sourceKind);
}

export function isAuthoringRunProvenance(provenance){
  return provenance?.kind==='authoring_workflow_run' || provenance?.kind==='skill_expansion_job';
}

// The two built-ins are real Workflow constructors, not labels for a service
// state machine. Source-specific resources and Provider slots are materialized
// per Run while the stage topology and authority boundary stay invariant.
export function instantiateAuthoringWorkflow({definition,id,sourceName,planner,reviewer,generation,planningResources,reviewResources,plannerSchema,plannerPrompt,reviewSchema,reviewPrompt}){
  requireValue(AUTHORING_WORKFLOWS.some(item=>item.id===definition?.id),'AUTHORING_WORKFLOW_MISSING','Authoring Run needs a registered built-in Workflow');
  requireValue(planner?.kind==='native_agent','EXPANSION_EXECUTOR_UNAVAILABLE','Authoring requires a user-selected native planning Provider');
  const workflow={...createDraft(id,`${definition.name}: ${String(sourceName).slice(0,220)}`),status:'ready',description:`Read-only ${definition.name} Run. The Host compiles its semantic output and a human explicitly publishes the resulting Draft.`,tags:['internal-authoring',definition.id,definition.source_kind],finalization:{required:true,node_id:'final'}};
  const common={type:'agent',access:'read_only',approval:{required:false},retry:{max_attempts:generation?.max_rounds ?? 1},input_bindings:{},resources:Object.keys(planningResources).sort()};
  workflow.nodes=[
    {id:'start',type:'start'},
    {...common,id:'expand',role:planner.config.role,executor:{kind:'provider',provider_id:planner.id},outputs_schema:plannerSchema,prompt_template:plannerPrompt},
    {...common,id:'final',resources:reviewResources,input_bindings:{proposal:'/nodes/expand/output/proposal'},approval:{required:reviewer?.requires_user_approval ?? false},role:'finalizer',executor:{kind:'main'},...(reviewSchema?{outputs_schema:reviewSchema}:{}),prompt_template:reviewPrompt},
    {id:'end',type:'end'},
  ];
  workflow.edges=[['start','expand'],['expand','final'],['final','end']].map(([source,target])=>({id:`${source}-${target}`,source,target}));
  workflow.requirements={providers:[planner.id],tools:['read_workflow_resource'],mcp_servers:[],executables:[]};
  return workflow;
}
