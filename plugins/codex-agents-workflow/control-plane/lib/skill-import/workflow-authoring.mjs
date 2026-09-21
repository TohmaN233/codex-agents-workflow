import { createDraft } from '../workflow-schema.mjs';
import { requireValue } from '../workflow-paths.mjs';
import { importCoarseSkill } from './coarse-compiler.mjs';
import { BRIEF_SOURCE } from './authoring-source.mjs';

function briefDraft({workflow_id,name,brief,provider_id,role='advisor'}){
  requireValue(typeof brief==='string' && brief.trim().length>0 && brief.length<=150000,'WORKFLOW_BRIEF','Workflow brief must be nonempty and bounded');
  const workflow=createDraft(workflow_id,name);
  workflow.description=`Source-built Workflow: ${name}`.slice(0,4000);
  workflow.skill_policy={mode:'cooperative',implicit:'allow',ambient_allow:[],shadowed_skill_paths:[]};
  workflow.requirements={providers:provider_id?[provider_id]:[],tools:['read_workflow_resource'],mcp_servers:[],executables:[]};
  workflow.import_status={mode:'authored',source_hash:null,classification:'workflow_brief',unresolved:[],source_independent:true,relocation_evidence:null};
  const common={access:'read_only',approval:{required:false},retry:{max_attempts:1},input_bindings:{task:'/inputs/task'}};
  workflow.nodes=[
    {id:'start',type:'start'},
    {...common,id:'instructions',type:'agent',role,executor:provider_id?{kind:'provider',provider_id}:{kind:'main'},prompt_template:`Read the pinned Workflow resource ${BRIEF_SOURCE} and execute the user task {{task}} according to that brief. Report missing requirements instead of guessing.`,resources:[BRIEF_SOURCE],origin:{kind:'source',source_span:{resource:BRIEF_SOURCE,start_line:1,end_line:brief.split('\n').length}}},
    {...common,id:'final',type:'agent',role:'finalizer',executor:{kind:'main'},input_bindings:{task:'/inputs/task',instruction_result:'/nodes/instructions/output'},prompt_template:'Review the result against the pinned Workflow brief and user task. Accept only supported completion evidence.',resources:[BRIEF_SOURCE]},
    {id:'end',type:'end'},
  ];
  workflow.edges=[['start','instructions'],['instructions','final'],['final','end']].map(([source,target])=>({id:`${source}-${target}`,source,target}));
  workflow.finalization.node_id='final';
  return {workflow,resources:{[BRIEF_SOURCE]:Buffer.from(brief)},provenance:{kind:'workflow_build',compiler_version:1,source_kind:'brief'},import_report:{mode:'authored',calls_to_models:0,scripts_executed:0,requirements:structuredClone(workflow.requirements),observed_dependencies:[],references:[],problems:[]}};
}

export class WorkflowAuthoringCompiler{
  constructor({store}){this.store=store;}
  async seed(request){
    requireValue(request && ['skill','brief'].includes(request.kind),'WORKFLOW_AUTHORING_KIND','Authoring source must be skill or brief');
    if(request.kind==='skill')return importCoarseSkill(this.store,request.source_path,{id:request.workflow_id,name:request.name,providerId:request.provider_id,role:request.role,expectedSourceHash:request.expected_source_hash});
    const compiled=briefDraft(request);
    return this.store.create(compiled.workflow,compiled);
  }
}

export function compileWorkflowBrief(request){return briefDraft(request);}
