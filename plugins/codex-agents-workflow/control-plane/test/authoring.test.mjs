import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileWorkflowBrief } from '../lib/skill-import/workflow-authoring.mjs';
import { WorkflowForge } from '../lib/authoring/workflow-forge.mjs';
import { applySemanticRepair, INTERNAL_SEMANTIC_BLUEPRINT_SCHEMA, PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT as SEMANTIC_BLUEPRINT_CONTRACT, SEMANTIC_BLUEPRINT_CONTRACT as CURRENT_SEMANTIC_BLUEPRINT_CONTRACT, SEMANTIC_BLUEPRINT_SCHEMA, SEMANTIC_REPAIR_CONTRACT } from '../lib/authoring/blueprint-contract.mjs';
import { sourceSectionInventory } from '../lib/skill-import/source-dispositions.mjs';
import { observedSourceRequirements } from '../lib/skill-import/source-requirements.mjs';
import { prepareResources, revisionHash } from '../lib/workflow-revisions.mjs';
import { WorkflowStore } from '../lib/workflow-store.mjs';
import { exportWorkflowPackage, installWorkflowPackage, validateWorkflowPackage } from '../lib/workflow-package.mjs';
import { generationRetryClass, isGenerationContractFailure, MAX_PLANNER_ATTEMPTS } from '../lib/skill-import/generation-retry-policy.mjs';
import { AUTHORING_WORKFLOWS, authoringWorkflowForPack } from '../lib/authoring/authoring-workflows.mjs';
import { AUTHORING_RUNTIME_ENVELOPE_SCHEMA, authoringRunPack } from '../lib/skill-import/expansion-run.mjs';
import { managedNativeResultSchema } from '../lib/execution/host-main-automation.mjs';
import { validateData } from '../lib/workflow-data-schema.mjs';

const rules={version:1,instructions:'Host routing.',selection_mode:'automatic',routes:{implementation:{provider_id:'native-luna',role:'implementer'},complex_implementation:{provider_id:'native-terra',role:'implementer'},review:{provider_id:'native-reviewer',role:'reviewer'},planning:{provider_id:'native-terra',role:'implementer'}}};
const providers=[
  {id:'native-luna',enabled:true,kind:'native_agent',capabilities:{read:true,write:true},config:{role:'implementer'}},
  {id:'native-terra',enabled:true,kind:'native_agent',capabilities:{read:true,write:true},config:{role:'implementer'}},
  {id:'native-reviewer',enabled:true,kind:'native_agent',capabilities:{read:true,write:false},config:{role:'reviewer'}},
];

function sourceFixture(){
  const compiled=compileWorkflowBrief({workflow_id:'brief-fixture',name:'Brief fixture',brief:'# Workflow\n\n## Process\n\nImplement the requested change.\n\n## Review Checklist\n\nReview the evidence before delivery.',provider_id:'native-terra'});
  const prepared=prepareResources(compiled.resources);
  const snapshot={workflow:compiled.workflow,resources:prepared.manifest,provenance:compiled.provenance,import_report:compiled.import_report};
  return {pack:{...snapshot,revision_hash:revisionHash(snapshot)},resources:compiled.resources};
}

function activity(key,instructions,sections,{kind='work',operation='read',ownership='main',complexity='routine',continues='',produces=[],consumes=[]}={}){
  return {key,purpose:key,kind,instructions,ownership,operation,complexity,source_sections:sections,continues,consumes:consumes.map(item=>item.from.input?{name:item.name,source_kind:'input',input:item.from.input,activity:'',output:''}:{name:item.name,source_kind:'activity',input:'',activity:item.from.activity,output:item.from.output}),produces:produces.map(item=>({name:item.name,shape:typeof item.shape==='string'?{kind:item.shape,values:[],type_ref:''}:{...item.shape,values:item.shape.values.map(String),type_ref:item.shape.type_ref??''}})),capability:{kind:'none',semantic_name:''}};
}

function dispositions(sections,keys){return sections.map(item=>({section_id:item.section_id,disposition:'workflow',activity_keys:keys,trigger:'',reason:'Required by the brief.'}));}
function blueprint(fields){return {contract:SEMANTIC_BLUEPRINT_CONTRACT,purpose:fields.purpose,source_dispositions:fields.source_dispositions,semantic_rules:[],requirement_assignments:[],data_types:fields.data_types??[],activities:fields.activities,approvals:[],sequences:fields.sequences??[],parallels:fields.parallels??[],choices:fields.choices??[],root:fields.root};}

test('compact authoring contract derives the root and semantic repair changes only named entities',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const compact={contract:CURRENT_SEMANTIC_BLUEPRINT_CONTRACT,purpose:'Implement and review.',source_dispositions:sections.map(item=>({section_id:item.section_id,disposition:'workflow',activity_keys:['implement','review'],note:'Required by the brief.'})),requirement_assignments:[],records:[],lists:[],enums:[],activities:[
    {key:'implement',instructions:'Implement the requested change.',profile:'main_write',source_sections:ids,inputs:[],outputs:[{name:'result',kind:'text',values:[],type_ref:''}],tool:''},
    {key:'review',instructions:'Review the implementation evidence.',profile:'review',source_sections:ids,inputs:[{name:'implementation',from:'implement.result'}],outputs:[{name:'verdict',kind:'enum',values:['pass','fail'],type_ref:''}],tool:''},
  ],approvals:[],sequences:[{key:'delivery',members:['implement','review'],failure_meaning:'all_required'}],parallels:[],choices:[]};
  validateData(compact,SEMANTIC_BLUEPRINT_SCHEMA);
  const forged=new WorkflowForge().compile({pack,resources,blueprint:compact,context:{routing_rules:rules,routing_catalog:providers,providers}});
  assert.equal(forged.compiled.validation.valid,true);assert(forged.proposal.edges.some(edge=>edge.source==='implement'&&edge.target==='review'));
  const empty={source_dispositions:[],requirement_assignments:[],records:[],lists:[],enums:[],activities:[],approvals:[],sequences:[],parallels:[],choices:[]};
  const repaired=applySemanticRepair(compact,{contract:SEMANTIC_REPAIR_CONTRACT,purpose:'',upsert:{...structuredClone(empty),activities:[{...compact.activities[1],instructions:'Review exact implementation evidence and report gaps.'}]},remove:empty});
  assert.equal(repaired.activities[0].instructions,compact.activities[0].instructions);assert.match(repaired.activities[1].instructions,/exact implementation evidence/);
  assert(JSON.stringify(SEMANTIC_BLUEPRINT_SCHEMA).length<JSON.stringify(INTERNAL_SEMANTIC_BLUEPRINT_SCHEMA).length*0.82);
});

test('WorkflowForge lowers a brief semantic blueprint and owns every mechanical graph field',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Implement and review.',source_dispositions:dispositions(sections,['implement','review']),activities:[
    activity('implement','Implement the requested change.',ids,{operation:'write',produces:[{name:'result',shape:'text'}]}),
    activity('review','Review the implementation evidence.',ids,{kind:'review',consumes:[{name:'implementation',from:{activity:'implement',output:'result'}}],produces:[{name:'verdict',shape:{kind:'enum',values:['pass','fail']}}]}),
  ],sequences:[{key:'root_sequence',members:['implement','review'],failure_meaning:'all_required'}],root:'root_sequence'});
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}});
  assert.equal(forged.compiled.validation.valid,true);
  assert.deepEqual(forged.proposal.nodes.map(node=>node.id),['implement','review']);
  assert.equal(forged.proposal.nodes[1].input_bindings.implementation,'/nodes/implement/output/result');
  assert.equal(forged.proposal.nodes[0].source_span.start_line,sections[0].source_span.start_line);
  assert.equal(forged.proposal.nodes[0].source_span.end_line,sections.at(-1).source_span.end_line);
  assert(forged.proposal.edges.every(edge=>/^edge_\d{3}$/.test(edge.id)));
  assert(!JSON.stringify(forged.proposal).includes('planning_analysis.main_responsibilities'));
});

test('WorkflowForge derives parallel/join and conditional fan-in without model-authored IDs or pointers',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const decide=activity('decide','Choose a route.',ids,{kind:'decision',produces:[{name:'route',shape:{kind:'enum',values:['a','b']}}]});
  const branch=value=>activity(`branch_${value}`,`Perform branch ${value}.`,ids,{produces:[{name:'result',shape:'text'}]});
  const semantic=blueprint({purpose:'Branch safely.',source_dispositions:dispositions(sections,['decide','branch_a','branch_b']),activities:[decide,branch('a'),branch('b')],choices:[{key:'root_choice',decision_activity:'decide',output:'route',branches:[{value:'a',body:'branch_a'}],default_body:'branch_b'}],root:'root_choice'});
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}});
  assert.equal(forged.compiled.validation.valid,true);
  assert.equal(forged.proposal.nodes.filter(node=>node.type==='condition').length,1);
  assert.deepEqual(forged.compiled.workflow.nodes.find(node=>node.id==='final').input_bindings.upstream_result.coalesce.sort(),['/nodes/branch_a/output','/nodes/branch_b/output'].sort());
});

test('WorkflowForge derives a structured parallel region and aggregate bindings',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Run independent checks.',source_dispositions:dispositions(sections,['check_a','check_b','summarize']),activities:[
    activity('check_a','Run check A.',ids,{produces:[{name:'a',shape:'text'}]}),activity('check_b','Run check B.',ids,{produces:[{name:'b',shape:'text'}]}),
    activity('summarize','Summarize both checks.',ids,{consumes:[{name:'a',from:{activity:'check_a',output:'a'}},{name:'b',from:{activity:'check_b',output:'b'}}],produces:[{name:'summary',shape:'text'}]}),
  ],parallels:[{key:'checks',members:['check_a','check_b'],failure_meaning:'all_required'}],sequences:[{key:'root_sequence',members:['checks','summarize'],failure_meaning:'all_required'}],root:'root_sequence'});
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}});
  assert.equal(forged.compiled.validation.valid,true);
  const fork=forged.proposal.nodes.find(node=>node.type==='parallel'),join=forged.proposal.nodes.find(node=>node.type==='join'),summary=forged.proposal.nodes.find(node=>node.name==='summarize');
  assert.equal(fork.join_id,join.id);assert.equal(join.parallel_id,fork.id);
  assert.equal(summary.input_bindings.task,'/inputs/task');
  assert.equal(summary.input_bindings.a,'/nodes/check_a/output/a');
  assert.equal(summary.input_bindings.b,'/nodes/check_b/output/b');
  assert.equal(summary.input_bindings.upstream_check_a,'/nodes/check_a/output');
  assert.equal(summary.input_bindings.upstream_check_b,'/nodes/check_b/output');
});

test('WorkflowForge lowers converging choice branches to one shared semantic body',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Converge repeated fallback routes.',source_dispositions:dispositions(sections,['decide','deliver','unresolved']),activities:[
    activity('decide','Classify the outcome.',ids,{kind:'decision',produces:[{name:'outcome',shape:{kind:'enum',values:['pass','issues']}}]}),
    activity('deliver','Deliver the accepted result.',ids,{operation:'write',produces:[{name:'result',shape:'text'}]}),
    activity('unresolved','Report unresolved issues.',ids,{produces:[{name:'issues',shape:'text'}]}),
  ],choices:[{key:'root_choice',decision_activity:'decide',output:'outcome',branches:[{value:'pass',body:'deliver'},{value:'issues',body:'unresolved'}],default_body:'unresolved'}],root:'root_choice'});
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}});
  assert.equal(forged.compiled.validation.valid,true);
  assert.equal(forged.proposal.nodes.filter(node=>node.id==='unresolved').length,1);
  const condition=forged.proposal.nodes.find(node=>node.type==='condition');
  assert.equal(condition.cases.length,1);
  assert.equal(forged.proposal.edges.filter(edge=>edge.source===condition.id&&edge.target==='unresolved').length,1);
});

test('WorkflowForge reuses an explicitly sequenced decision and downstream body without duplicate nodes or self edges',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Reuse semantic components across nested control groups.',source_dispositions:dispositions(sections,['decide','plan','deliver']),activities:[
    activity('decide','Determine whether optional planning applies.',ids,{kind:'decision',produces:[{name:'needed',shape:{kind:'enum',values:['true','false']}}]}),
    activity('plan','Create the implementation plan.',ids,{produces:[{name:'plan',shape:'text'}]}),
    activity('deliver','Deliver the result.',ids,{operation:'write',consumes:[{name:'plan',from:{activity:'plan',output:'plan'}}],produces:[{name:'result',shape:'text'}]}),
  ],choices:[{key:'planning_choice',decision_activity:'decide',output:'needed',branches:[{value:'true',body:'plan'},{value:'false',body:'plan'}],default_body:'plan'}],sequences:[
    {key:'preparation',members:['decide','planning_choice'],failure_meaning:'all_required'},
    {key:'delivery',members:['plan','deliver'],failure_meaning:'all_required'},
    {key:'root_sequence',members:['preparation','delivery'],failure_meaning:'all_required'},
  ],root:'root_sequence'});
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}});
  assert.equal(forged.compiled.validation.valid,true);
  assert.equal(forged.proposal.nodes.filter(node=>node.id==='decide').length,1);
  assert.equal(forged.proposal.nodes.filter(node=>node.id==='plan').length,1);
  assert.equal(forged.proposal.edges.some(edge=>edge.source===edge.target),false);
  assert.equal(forged.proposal.nodes.find(node=>node.id==='deliver').input_bindings.plan,'/nodes/plan/output/plan');
});

test('WorkflowForge accepts nested mutually exclusive choice exits without treating them as parallel fan-in',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Route nested exclusive outcomes.',source_dispositions:dispositions(sections,['mode','setup','assess','deliver','unresolved']),activities:[
    activity('mode','Choose setup or editing.',ids,{kind:'decision',produces:[{name:'mode',shape:{kind:'enum',values:['setup','editing']}}]}),
    activity('setup','Complete setup only.',ids,{operation:'write',produces:[{name:'setup',shape:'text'}]}),
    activity('assess','Assess editing outcome.',ids,{kind:'decision',produces:[{name:'outcome',shape:{kind:'enum',values:['pass','issues']}}]}),
    activity('deliver','Deliver the accepted edit.',ids,{operation:'write',produces:[{name:'result',shape:'text'}]}),
    activity('unresolved','Report unresolved edit issues.',ids,{produces:[{name:'issues',shape:'text'}]}),
  ],choices:[
    {key:'result_choice',decision_activity:'assess',output:'outcome',branches:[{value:'pass',body:'deliver'}],default_body:'unresolved'},
    {key:'mode_choice',decision_activity:'mode',output:'mode',branches:[{value:'editing',body:'result_choice'}],default_body:'setup'},
  ],root:'mode_choice'});
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}});
  assert.equal(forged.compiled.validation.valid,true);
  assert.deepEqual(forged.compiled.workflow.nodes.find(node=>node.id==='final').input_bindings.upstream_result.coalesce.sort(),['/nodes/deliver/output','/nodes/setup/output','/nodes/unresolved/output'].sort());
});

test('WorkflowForge discards model-authored semantic ordinals instead of cross-wiring Host requirement IDs',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Keep semantic rule ownership local.',source_dispositions:dispositions(sections,['work']),activities:[activity('work','Perform the work.',ids,{produces:[{name:'result',shape:'text'}]})],root:'work'});
  semantic.semantic_rules=[{section_id:ids[0],statement:'Preserve the source-defined rule.',activity_keys:['work'],applies_when:''}];
  semantic.requirement_assignments=[
    {requirement_id:'semantic_rule_001',activity_keys:['work'],binding_names:['result'],runtime_guards:['First redundant ordinal.']},
    {requirement_id:'semantic_rule_017',activity_keys:['work'],binding_names:['result'],runtime_guards:['Dangling redundant ordinal.']},
  ];
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}}),mapping=forged.proposal.requirement_mappings.find(item=>item.requirement_id==='semantic_rule_001');
  assert.equal(forged.compiled.validation.valid,true);
  assert.deepEqual(mapping.node_ids,['work']);
  assert.deepEqual(mapping.binding_names,[]);
  assert.equal(forged.proposal.requirement_mappings.some(item=>item.requirement_id==='semantic_rule_017'),false);
});

test('WorkflowForge projects an observed approval to its unique gate and only post-gate operations',()=>{
  const compiled=compileWorkflowBrief({workflow_id:'approval-fixture',name:'Approval fixture',brief:'# Workflow\n\n## Process\n\nPropose a plan. Obtain user approval before implementation. Then implement the approved plan.',provider_id:'native-terra'}),prepared=prepareResources(compiled.resources),snapshot={workflow:compiled.workflow,resources:prepared.manifest,provenance:compiled.provenance,import_report:compiled.import_report},pack={...snapshot,revision_hash:revisionHash(snapshot)},resources=compiled.resources;
  const sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id),approvalRequirement=observedSourceRequirements(resources).find(item=>item.requirement_kind==='approval');
  assert(approvalRequirement);
  const semantic=blueprint({purpose:'Require approval between proposal and implementation.',source_dispositions:dispositions(sections,['propose','approve','implement']),activities:[
    activity('propose','Propose the plan.',ids,{produces:[{name:'plan',shape:'text'}]}),
    activity('implement','Implement the approved plan.',ids,{operation:'write',consumes:[{name:'plan',from:{activity:'propose',output:'plan'}}],produces:[{name:'result',shape:'text'}]}),
  ],sequences:[{key:'root_sequence',members:['propose','approve','implement'],failure_meaning:'all_required'}],root:'root_sequence'});
  semantic.approvals=[{key:'approve',question:'Approve the plan before implementation?',source_sections:ids}];
  semantic.requirement_assignments=[{requirement_id:approvalRequirement.requirement_id,activity_keys:['propose','implement'],binding_names:['plan'],runtime_guards:[]}];
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}}),mapping=forged.proposal.requirement_mappings.find(item=>item.requirement_id===approvalRequirement.requirement_id),gate=forged.proposal.nodes.find(item=>item.type==='human_gate');
  assert.equal(forged.compiled.validation.valid,true);
  assert.deepEqual(mapping.node_ids.sort(),[gate.id,'implement'].sort());
  assert.equal(mapping.node_ids.includes('propose'),false);
});

test('WorkflowForge derives continuation only for a direct same-Provider isolated-worker successor',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Derive safe task lineage.',source_dispositions:dispositions(sections,['analyze','implement','finish']),activities:[
    activity('analyze','Analyze the task.',ids,{ownership:'isolated_worker',complexity:'complex',continues:'implement'}),
    activity('implement','Implement the task.',ids,{ownership:'isolated_worker',operation:'write',complexity:'complex',continues:'finish'}),
    activity('finish','Finish routine output.',ids,{ownership:'isolated_worker',operation:'write'}),
  ],sequences:[{key:'root_sequence',members:['analyze','implement','finish'],failure_meaning:'all_required'}],root:'root_sequence'});
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}}),implementation=forged.proposal.nodes.find(node=>node.id==='implement'),finish=forged.proposal.nodes.find(node=>node.id==='finish');
  assert.equal(forged.compiled.validation.valid,true);
  assert.equal(implementation.thread_lifecycle,'continue');
  assert.equal(implementation.thread_source_node,'analyze');
  assert.equal(finish.thread_lifecycle,'start');
  assert.equal(finish.thread_source_node,undefined);
});

test('WorkflowForge generates nested schemas from named semantic data types and binds source-mentioned pinned resources',()=>{
  const compiled=compileWorkflowBrief({workflow_id:'typed-fixture',name:'Typed fixture',brief:'# Workflow\n\n## Process\n\nInspect and use scripts/runner.py, then emit its exact evidence records.'});
  compiled.resources['source/scripts/runner.py']=Buffer.from('def run(): pass\n');
  const prepared=prepareResources(compiled.resources),snapshot={workflow:compiled.workflow,resources:prepared.manifest,provenance:compiled.provenance,import_report:compiled.import_report},pack={...snapshot,revision_hash:revisionHash(snapshot)},resources=compiled.resources,sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Preserve a typed runner interface.',source_dispositions:dispositions(sections,['run']),data_types:[
    {key:'assertion_record',kind:'object',fields:[{name:'kind',type_ref:'text',required:true},{name:'passed',type_ref:'boolean',required:true}],item_type_ref:'',values:[],openness:'closed'},
    {key:'assertion_records',kind:'list',fields:[],item_type_ref:'assertion_record',values:[],openness:'closed'},
    {key:'evidence',kind:'object',fields:[{name:'seed',type_ref:'integer',required:true},{name:'assertions',type_ref:'assertion_records',required:true}],item_type_ref:'',values:[],openness:'closed'},
  ],activities:[activity('run','Run the pinned interface.',ids,{operation:'write',produces:[{name:'evidence',shape:{kind:'object',values:[],type_ref:'evidence'}}]})],root:'run'});
  const forged=new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}}),node=forged.proposal.nodes.find(item=>item.id==='run');
  assert.equal(forged.compiled.validation.valid,true);
  assert.deepEqual(node.resource_refs,['source/WORKFLOW.md','source/scripts/runner.py']);
  assert.deepEqual(node.outputs_schema.properties.evidence,{type:'object',properties:{seed:{type:'integer'},assertions:{type:'array',items:{type:'object',properties:{kind:{type:'string'},passed:{type:'boolean'}},required:['kind','passed'],additionalProperties:false}}},required:['seed','assertions'],additionalProperties:false});
});

test('WorkflowForge rejects coarse structured outputs when an activity cites an executable interface',()=>{
  const compiled=compileWorkflowBrief({workflow_id:'coarse-interface',name:'Coarse interface',brief:'# Workflow\n\n## Process\n\nUse scripts/runner.py and return its result.'});
  compiled.resources['source/scripts/runner.py']=Buffer.from('def run(): pass\n');
  const prepared=prepareResources(compiled.resources),snapshot={workflow:compiled.workflow,resources:prepared.manifest,provenance:compiled.provenance,import_report:compiled.import_report},pack={...snapshot,revision_hash:revisionHash(snapshot)},resources=compiled.resources,sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id);
  const semantic=blueprint({purpose:'Reject a missing runner interface.',source_dispositions:dispositions(sections,['run']),activities:[activity('run','Run the pinned interface.',ids,{operation:'write',produces:[{name:'result',shape:{kind:'object',values:[],type_ref:''}}]})],root:'run'});
  assert.throws(()=>new WorkflowForge().compile({pack,resources,blueprint:semantic,context:{routing_rules:rules,routing_catalog:providers,providers}}),error=>error.code==='AUTHORING_SEMANTIC'&&/named data type/.test(error.message));
});

test('WorkflowForge upgrades a persisted v2 blueprint without asking a model to rewrite its envelope',()=>{
  const {pack,resources}=sourceFixture(),sections=sourceSectionInventory(resources),ids=sections.map(item=>item.section_id),legacy=blueprint({purpose:'Replay legacy semantics.',source_dispositions:dispositions(sections,['work']),activities:[activity('work','Perform the work.',ids,{produces:[{name:'result',shape:'text'}]})],root:'work'});
  legacy.contract='workflow-semantic-blueprint/v2';delete legacy.data_types;for(const output of legacy.activities[0].produces)delete output.shape.type_ref;
  const forged=new WorkflowForge().compile({pack,resources,blueprint:legacy,context:{routing_rules:rules,routing_catalog:providers,providers}});
  assert.equal(forged.compiled.validation.valid,true);
  assert.equal(forged.proposal.nodes.find(node=>node.id==='work').outputs_schema.properties.result.type,'string');
});

test('authoring retry policy never retries mechanical failures and permits only one semantic repair',()=>{
  for(const code of ['DATA_INVALID','STRICT_OUTPUT_JSON','GENERATION_PROPOSAL_CONTRACT','AUTHORING_BLUEPRINT','WORKFLOW_PACKAGE_INTEGRITY','EXPANSION_GRAPH_INVALID','ROUTING_CLASSIFICATION','EXPANSION_WRITE_PROVIDER','EXPANSION_THREAD_LIFECYCLE'])assert.equal(generationRetryClass({code}),'mechanical');
  for(const code of ['AUTHORING_SEMANTIC','GENERATION_REVIEW_FINDINGS','GENERATION_DETERMINISTIC_AUDIT','EXPANSION_SOURCE_DISPOSITIONS'])assert.equal(generationRetryClass({code}),'semantic');
  assert.equal(MAX_PLANNER_ATTEMPTS,2);
  assert.equal(isGenerationContractFailure({code:'AUTHORING_SEMANTIC'}),true);
  assert.equal(isGenerationContractFailure({code:'DATA_INVALID'}),true);
  assert.equal(isGenerationContractFailure({code:'ENOENT'}),false);
});

test('Skill conversion and from-scratch authoring are two configurations of the same strict authoring Workflow',()=>{
  assert.deepEqual(AUTHORING_WORKFLOWS.map(item=>item.id),['system.skill2workflow','system.build-workflow']);
  assert.equal(AUTHORING_WORKFLOWS[0].semantic_contract,AUTHORING_WORKFLOWS[1].semantic_contract);
  assert.equal(AUTHORING_WORKFLOWS[0].mechanical_repairs,0);
  assert.equal(AUTHORING_WORKFLOWS[0].semantic_repairs,1);
  const {pack,resources}=sourceFixture();
  assert.equal(pack.workflow.skill_policy.mode,'cooperative');
  assert.equal(authoringWorkflowForPack(pack).id,'system.build-workflow');
  assert.equal(authoringWorkflowForPack({...pack,provenance:{kind:'skill_import',source_kind:'skill'}}).id,'system.skill2workflow');
  const job=authoringRunPack(pack,resources,providers[1],'authoring-contract',rules,false,null,providers);
  assert.equal(job.provenance.authoring_workflow_id,'system.build-workflow');
  assert.equal(job.workflow.nodes.find(item=>item.id==='expand').outputs_schema,AUTHORING_RUNTIME_ENVELOPE_SCHEMA);
  assert.doesNotThrow(()=>managedNativeResultSchema(job.workflow.nodes.find(item=>item.id==='expand')));
});

test('portable Workflow package validates content identity and installs atomically',async t=>{
  const root=await mkdtemp(join(tmpdir(),'workflow-authoring-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=new WorkflowStore(join(root,'source')).initialize(),target=new WorkflowStore(join(root,'target')).initialize();
  const [sourceStore,targetStore]=await Promise.all([source,target]);
  const compiled=compileWorkflowBrief({workflow_id:'portable-brief',name:'Portable brief',brief:'# Workflow\n\n## Process\n\nPerform the task.'});
  const saved=await sourceStore.create(compiled.workflow,compiled),resources=await sourceStore.resources(saved.workflow.id,saved.revision_hash);
  const bundle=exportWorkflowPackage(saved,resources,{packageVersion:'1.2.3'});
  assert.equal(validateWorkflowPackage(bundle).package.version,'1.2.3');
  assert.deepEqual(bundle.compatibility,{plugin:'codex-agents-workflow',package_api:1,workflow_schema:1});
  assert.deepEqual(bundle.dependencies,{providers:[],tools:['read_workflow_resource'],mcp_servers:[],executables:[]});
  const installed=await installWorkflowPackage(targetStore,bundle,{source:'memory'});
  assert.equal(installed.workflow.id,'portable-brief');
  const tampered=structuredClone(bundle);tampered.objects[0].content_base64=Buffer.from('tampered').toString('base64');
  assert.throws(()=>validateWorkflowPackage(tampered),{code:'WORKFLOW_PACKAGE_INTEGRITY'});
});
