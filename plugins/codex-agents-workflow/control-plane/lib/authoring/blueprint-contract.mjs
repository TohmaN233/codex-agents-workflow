export const LEGACY_SEMANTIC_BLUEPRINT_CONTRACT='workflow-semantic-blueprint/v2';
export const PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT='workflow-semantic-blueprint/v3';
export const SEMANTIC_BLUEPRINT_CONTRACT='workflow-semantic-blueprint/v4';
export const SEMANTIC_REPAIR_CONTRACT='workflow-semantic-repair/v1';

const id={type:'string',minLength:1,maxLength:128};
const optionalId={type:'string',maxLength:128};
const text={type:'string',minLength:1,maxLength:12000};
const optionalText={type:'string',maxLength:2000};
const ids=(max=128)=>({type:'array',maxItems:max,items:id});
const compactShape={type:'object',required:['name','kind','values','type_ref'],additionalProperties:false,properties:{name:id,kind:{type:'string',enum:['text','boolean','number','integer','object','list','enum']},values:{type:'array',maxItems:128,items:{type:'string',maxLength:1000}},type_ref:optionalId}};
const compactInput={type:'object',required:['name','from'],additionalProperties:false,properties:{name:id,from:{type:'string',minLength:1,maxLength:260}}};
const compactActivity={type:'object',required:['key','instructions','profile','source_sections','inputs','outputs','tool'],additionalProperties:false,properties:{
  key:id,instructions:text,profile:{type:'string',enum:['main_read','main_write','worker_read','worker_write','worker_complex_read','worker_complex_write','review','decision']},source_sections:{type:'array',minItems:1,maxItems:128,items:id},inputs:{type:'array',maxItems:128,items:compactInput},outputs:{type:'array',maxItems:128,items:compactShape},tool:optionalId,
}};
const compactDisposition={type:'object',required:['section_id','disposition','activity_keys','note'],additionalProperties:false,properties:{section_id:id,disposition:{type:'string',enum:['workflow','conditional','reference','omit']},activity_keys:ids(128),note:optionalText}};
const compactAssignment={type:'object',required:['requirement_id','activity_keys'],additionalProperties:false,properties:{requirement_id:id,activity_keys:{type:'array',minItems:1,maxItems:128,items:id}}};
const dataField={type:'object',required:['name','type','required'],additionalProperties:false,properties:{name:id,type:id,required:{type:'boolean'}}};
const recordType={type:'object',required:['key','fields','open'],additionalProperties:false,properties:{key:id,fields:{type:'array',maxItems:256,items:dataField},open:{type:'boolean'}}};
const listType={type:'object',required:['key','item_type'],additionalProperties:false,properties:{key:id,item_type:id}};
const enumType={type:'object',required:['key','values'],additionalProperties:false,properties:{key:id,values:{type:'array',minItems:1,maxItems:128,items:{type:'string',maxLength:1000}}}};
const approval={type:'object',required:['key','question','source_sections'],additionalProperties:false,properties:{key:id,question:text,source_sections:{type:'array',minItems:1,maxItems:128,items:id}}};
const group={type:'object',required:['key','members','failure_meaning'],additionalProperties:false,properties:{key:id,members:{type:'array',minItems:1,maxItems:128,items:id},failure_meaning:{type:'string',enum:['all_required','partial_evidence_allowed']}}};
const choiceBranch={type:'object',required:['value','body'],additionalProperties:false,properties:{value:{type:'string',minLength:1,maxLength:1000},body:id}};
const choice={type:'object',required:['key','decision_activity','output','branches','default_body'],additionalProperties:false,properties:{key:id,decision_activity:id,output:id,branches:{type:'array',minItems:1,maxItems:128,items:choiceBranch},default_body:id}};

// The model describes meaning only. The Host derives root, graph, IDs, schemas,
// bindings, executors, permissions, source spans and package metadata.
export const SEMANTIC_BLUEPRINT_SCHEMA=Object.freeze({type:'object',required:['contract','purpose','source_dispositions','requirement_assignments','records','lists','enums','activities','approvals','sequences','parallels','choices'],additionalProperties:false,properties:{
  contract:{type:'string',const:SEMANTIC_BLUEPRINT_CONTRACT},purpose:text,source_dispositions:{type:'array',maxItems:200,items:compactDisposition},requirement_assignments:{type:'array',maxItems:500,items:compactAssignment},records:{type:'array',maxItems:128,items:recordType},lists:{type:'array',maxItems:128,items:listType},enums:{type:'array',maxItems:128,items:enumType},activities:{type:'array',minItems:1,maxItems:64,items:compactActivity},approvals:{type:'array',maxItems:64,items:approval},sequences:{type:'array',maxItems:64,items:group},parallels:{type:'array',maxItems:64,items:group},choices:{type:'array',maxItems:64,items:choice},
}});

const repairCollections=['source_dispositions','requirement_assignments','records','lists','enums','activities','approvals','sequences','parallels','choices'];
const repairChanges={type:'object',required:repairCollections,additionalProperties:false,properties:{
  source_dispositions:{type:'array',maxItems:200,items:compactDisposition},requirement_assignments:{type:'array',maxItems:500,items:compactAssignment},records:{type:'array',maxItems:128,items:recordType},lists:{type:'array',maxItems:128,items:listType},enums:{type:'array',maxItems:128,items:enumType},activities:{type:'array',maxItems:64,items:compactActivity},approvals:{type:'array',maxItems:64,items:approval},sequences:{type:'array',maxItems:64,items:group},parallels:{type:'array',maxItems:64,items:group},choices:{type:'array',maxItems:64,items:choice},
}};
const repairRemovals={type:'object',required:repairCollections,additionalProperties:false,properties:Object.fromEntries(repairCollections.map(name=>[name,ids(name==='requirement_assignments'?500:200)]))};
export const SEMANTIC_REPAIR_SCHEMA=Object.freeze({type:'object',required:['contract','purpose','upsert','remove'],additionalProperties:false,properties:{contract:{type:'string',const:SEMANTIC_REPAIR_CONTRACT},purpose:optionalText,upsert:repairChanges,remove:repairRemovals}});

// v3 is an internal lowering form and remains readable for durable historical
// Runs. New planners never see or emit it.
const internalShape={type:'object',required:['kind','values','type_ref'],additionalProperties:false,properties:{kind:{type:'string',enum:['text','boolean','number','integer','object','list','enum']},values:{type:'array',maxItems:128,items:{type:'string',maxLength:1000}},type_ref:optionalId}};
const consumption={type:'object',required:['name','source_kind','input','activity','output'],additionalProperties:false,properties:{name:id,source_kind:{type:'string',enum:['input','activity']},input:optionalId,activity:optionalId,output:optionalId}};
const production={type:'object',required:['name','shape'],additionalProperties:false,properties:{name:id,shape:internalShape}};
const capability={type:'object',required:['kind','semantic_name'],additionalProperties:false,properties:{kind:{type:'string',enum:['none','registered_tool']},semantic_name:optionalId}};
const internalActivity={type:'object',required:['key','purpose','kind','instructions','ownership','operation','complexity','source_sections','continues','consumes','produces','capability'],additionalProperties:false,properties:{key:id,purpose:text,kind:{type:'string',enum:['work','review','decision']},instructions:text,ownership:{type:'string',enum:['main','isolated_worker']},operation:{type:'string',enum:['read','write']},complexity:{type:'string',enum:['routine','complex']},source_sections:{type:'array',minItems:1,maxItems:128,items:id},continues:optionalId,consumes:{type:'array',maxItems:128,items:consumption},produces:{type:'array',maxItems:128,items:production},capability}};
const internalDisposition={type:'object',required:['section_id','disposition','activity_keys','trigger','reason'],additionalProperties:false,properties:{section_id:id,disposition:{type:'string',enum:['workflow','conditional','reference','omit']},activity_keys:ids(128),trigger:optionalText,reason:optionalText}};
const internalRule={type:'object',required:['section_id','statement','activity_keys','applies_when'],additionalProperties:false,properties:{section_id:id,statement:text,activity_keys:{type:'array',minItems:1,maxItems:128,items:id},applies_when:optionalText}};
const internalAssignment={type:'object',required:['requirement_id','activity_keys','binding_names','runtime_guards'],additionalProperties:false,properties:{requirement_id:id,activity_keys:{type:'array',minItems:1,maxItems:128,items:id},binding_names:ids(128),runtime_guards:{type:'array',maxItems:128,items:{type:'string',minLength:1,maxLength:2000}}}};
const internalDataType={type:'object',required:['key','kind','fields','item_type_ref','values','openness'],additionalProperties:false,properties:{key:id,kind:{type:'string',enum:['text','boolean','number','integer','object','list','enum']},fields:{type:'array',maxItems:256,items:{type:'object',required:['name','type_ref','required'],additionalProperties:false,properties:{name:id,type_ref:id,required:{type:'boolean'}}}},item_type_ref:optionalId,values:{type:'array',maxItems:128,items:{type:'string',maxLength:1000}},openness:{type:'string',enum:['closed','open']}}};
export const INTERNAL_SEMANTIC_BLUEPRINT_SCHEMA=Object.freeze({type:'object',required:['contract','purpose','source_dispositions','semantic_rules','requirement_assignments','data_types','activities','approvals','sequences','parallels','choices','root'],additionalProperties:false,properties:{contract:{type:'string',const:PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT},purpose:text,source_dispositions:{type:'array',maxItems:500,items:internalDisposition},semantic_rules:{type:'array',maxItems:500,items:internalRule},requirement_assignments:{type:'array',maxItems:500,items:internalAssignment},data_types:{type:'array',maxItems:500,items:internalDataType},activities:{type:'array',minItems:1,maxItems:500,items:internalActivity},approvals:{type:'array',maxItems:128,items:approval},sequences:{type:'array',maxItems:256,items:group},parallels:{type:'array',maxItems:256,items:group},choices:{type:'array',maxItems:256,items:choice},root:id}});

const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const formatFail=message=>fail('AUTHORING_FORMAT',message);
const semanticFail=message=>fail('AUTHORING_SEMANTIC',message);
const keyOf=(collection,item)=>collection==='source_dispositions'?item.section_id:collection==='requirement_assignments'?item.requirement_id:item.key;
const upsert=(items,changes,collection)=>{
  const currentKeys=items.map(item=>keyOf(collection,item)),changeKeys=changes.map(item=>keyOf(collection,item));
  if(new Set(currentKeys).size!==currentKeys.length)formatFail(`Semantic repair base has duplicate ${collection} keys`);
  if(new Set(changeKeys).size!==changeKeys.length)formatFail(`Semantic repair contains duplicate ${collection} upserts`);
  const next=new Map(items.map(item=>[keyOf(collection,item),structuredClone(item)]));
  for(const item of changes)next.set(keyOf(collection,item),structuredClone(item));
  return [...next.values()];
};

export function applySemanticRepair(previous,patch){
  if(previous?.contract!==SEMANTIC_BLUEPRINT_CONTRACT)formatFail('Semantic repair requires the current compact blueprint');
  if(patch?.contract!==SEMANTIC_REPAIR_CONTRACT)formatFail('Semantic repair uses workflow-semantic-repair/v1');
  const next=structuredClone(previous);
  if(patch.purpose)next.purpose=patch.purpose;
  for(const collection of repairCollections){
    const removed=new Set(patch.remove?.[collection] ?? []);
    next[collection]=upsert((next[collection] ?? []).filter(item=>!removed.has(keyOf(collection,item))),patch.upsert?.[collection] ?? [],collection);
  }
  return next;
}

function derivedRoot(blueprint){
  const components=[...(blueprint.activities ?? []),...(blueprint.approvals ?? []),...(blueprint.sequences ?? []),...(blueprint.parallels ?? []),...(blueprint.choices ?? [])].map(item=>item.key);
  const referenced=new Set([...(blueprint.sequences ?? []).flatMap(item=>item.members),...(blueprint.parallels ?? []).flatMap(item=>item.members),...(blueprint.choices ?? []).flatMap(item=>[item.decision_activity,item.default_body,...item.branches.map(branch=>branch.body)])]);
  const roots=components.filter(key=>!referenced.has(key));
  if(roots.length===1)return {root:roots[0],sequences:blueprint.sequences};
  if(roots.length>1){let key='host_root_sequence';while(components.includes(key))key='host_'+key;return {root:key,sequences:[...blueprint.sequences,{key,members:roots,failure_meaning:'all_required'}]};}
  semanticFail('Semantic components do not have an acyclic root');
}

function compactToInternal(value){
  const profiles={main_read:{ownership:'main',operation:'read',complexity:'routine',kind:'work'},main_write:{ownership:'main',operation:'write',complexity:'routine',kind:'work'},worker_read:{ownership:'isolated_worker',operation:'read',complexity:'routine',kind:'work'},worker_write:{ownership:'isolated_worker',operation:'write',complexity:'routine',kind:'work'},worker_complex_read:{ownership:'isolated_worker',operation:'read',complexity:'complex',kind:'work'},worker_complex_write:{ownership:'isolated_worker',operation:'write',complexity:'complex',kind:'work'},review:{ownership:'isolated_worker',operation:'read',complexity:'routine',kind:'review'},decision:{ownership:'main',operation:'read',complexity:'routine',kind:'decision'}};
  const parseInput=item=>{
    if(item.from.startsWith('input:'))return {name:item.name,source_kind:'input',input:item.from.slice(6),activity:'',output:''};
    const separator=item.from.indexOf('.');if(separator<1 || separator===item.from.length-1)formatFail(`Activity input ${item.name} must use input:name or activity.output`);
    return {name:item.name,source_kind:'activity',input:'',activity:item.from.slice(0,separator),output:item.from.slice(separator+1)};
  };
  const activities=value.activities.map(item=>{const selected=profiles[item.profile];if(!selected)formatFail(`Unknown activity profile ${item.profile}`);return {key:item.key,purpose:item.instructions.split(/\r?\n/,1)[0].slice(0,240)||item.key,kind:selected.kind,instructions:item.instructions,ownership:selected.ownership,operation:selected.operation,complexity:selected.complexity,source_sections:item.source_sections,continues:'',consumes:item.inputs.map(parseInput),produces:item.outputs.map(output=>({name:output.name,shape:{kind:output.kind,values:output.values,type_ref:output.type_ref}})),capability:{kind:item.tool?'registered_tool':'none',semantic_name:item.tool}};});
  const root=derivedRoot(value);
  return {contract:PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT,purpose:value.purpose,source_dispositions:value.source_dispositions.map(item=>({section_id:item.section_id,disposition:item.disposition,activity_keys:item.activity_keys,trigger:item.disposition==='conditional'?item.note:'',reason:item.note})),semantic_rules:[],requirement_assignments:value.requirement_assignments.map(item=>({...item,binding_names:[],runtime_guards:[]})),data_types:[
    ...value.records.map(item=>({key:item.key,kind:'object',fields:item.fields.map(field=>({name:field.name,type_ref:field.type,required:field.required})),item_type_ref:'',values:[],openness:item.open?'open':'closed'})),
    ...value.lists.map(item=>({key:item.key,kind:'list',fields:[],item_type_ref:item.item_type,values:[],openness:'closed'})),
    ...value.enums.map(item=>({key:item.key,kind:'enum',fields:[],item_type_ref:'',values:item.values,openness:'closed'})),
  ],activities,approvals:structuredClone(value.approvals),sequences:structuredClone(root.sequences),parallels:structuredClone(value.parallels),choices:structuredClone(value.choices),root:root.root};
}

export function normalizeSemanticBlueprint(value){
  const blueprint=structuredClone(value);
  if(blueprint?.contract===SEMANTIC_BLUEPRINT_CONTRACT)return compactToInternal(blueprint);
  if(blueprint?.contract===LEGACY_SEMANTIC_BLUEPRINT_CONTRACT){blueprint.contract=PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT;blueprint.data_types??=[];for(const activity of blueprint.activities ?? [])for(const output of activity.produces ?? [])output.shape.type_ref??='';}
  return blueprint;
}

export const SEMANTIC_BLUEPRINT_GUIDE=Object.freeze({
  contract:SEMANTIC_BLUEPRINT_CONTRACT,
  purpose:'Describe only preserved task meaning. The Host compiles every Workflow mechanic.',
  activities:'Each activity has instructions, one semantic execution profile, cited source sections, compact inputs (input:name or activity.output), outputs and an optional exact registered tool name.',
  controls:'Use named sequence, parallel, choice and approval groups. Do not choose a root; the Host derives it and conservatively sequences otherwise independent roots.',
  source_dispositions:'Classify every supplied section once. note is the exact trigger for conditional sections and a concise reason otherwise.',
  data:'Declare records, lists and enums only when structured outputs need them. The Host emits JSON Schema.',
  repair:'A later semantic repair emits only stable-key upserts/removals, never the whole blueprint.',
  host_owned:['root','Workflow/node/edge IDs','start/final/end','parallel/join mechanics','condition DSL','JSON Schema','JSON Pointer and bindings','executor/provider/model/role/access/retry','source spans/confidence/resources/requirement kinds and status','revision/certificate/package fields'],
});
