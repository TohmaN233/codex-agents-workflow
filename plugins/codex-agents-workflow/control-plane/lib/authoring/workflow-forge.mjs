import { requireValue } from '../workflow-paths.mjs';
import { compileExpansion } from '../skill-import/semantic-expander.mjs';
import { sourceSectionInventory } from '../skill-import/source-dispositions.mjs';
import { observedSourceRequirements } from '../skill-import/source-requirements.mjs';
import { authoringSourcePath } from '../skill-import/authoring-source.mjs';
import { normalizeSemanticBlueprint, PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT } from './blueprint-contract.mjs';
export { SEMANTIC_BLUEPRINT_CONTRACT } from './blueprint-contract.mjs';

const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const localKey=value=>typeof value==='string' && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value);
const primitiveSchema=kind=>{
  if(kind==='text')return {type:'string'};
  if(['boolean','number','integer'].includes(kind))return {type:kind};
  if(kind==='object')return {type:'object',additionalProperties:true};
  if(kind==='list')return {type:'array',items:{type:'string'}};
  return null;
};
function dataTypeResolver(definitions=[]){
  requireValue(Array.isArray(definitions)&&definitions.every(item=>object(item)&&Array.isArray(item.fields)&&Array.isArray(item.values)&&typeof item.item_type_ref==='string'&&['closed','open'].includes(item.openness)),'AUTHORING_SEMANTIC','Named data types must use the fixed v3 shape');
  const types=new Map(definitions.map(item=>[item.key,item])),cache=new Map(),visiting=new Set();
  requireValue(types.size===definitions.length&&definitions.every(item=>localKey(item.key)),'AUTHORING_SEMANTIC','Named data type keys must be unique local keys');
  const resolve=ref=>{
    const builtin=primitiveSchema(ref);if(builtin)return builtin;
    requireValue(types.has(ref),'AUTHORING_SEMANTIC',`Unknown semantic data type ${ref}`);
    if(cache.has(ref))return structuredClone(cache.get(ref));
    requireValue(!visiting.has(ref),'AUTHORING_SEMANTIC',`Semantic data types contain a cycle at ${ref}`);visiting.add(ref);
    const item=types.get(ref);let schema;
    if(item.kind==='object'){
      requireValue(Array.isArray(item.fields)&&new Set(item.fields.map(field=>field.name)).size===item.fields.length&&item.fields.every(field=>localKey(field.name))&&!item.item_type_ref&&item.values.length===0,'AUTHORING_SEMANTIC',`Object data type ${ref} needs unique fields and no list/enum payload`);
      const properties=Object.fromEntries(item.fields.map(field=>[field.name,resolve(field.type_ref)])),required=item.fields.filter(field=>field.required).map(field=>field.name);
      schema={type:'object',properties,required,additionalProperties:item.openness==='open'};
    } else if(item.kind==='list'){
      requireValue(typeof item.item_type_ref==='string'&&item.item_type_ref&&item.fields.length===0&&item.values.length===0&&item.openness==='closed','AUTHORING_SEMANTIC',`List data type ${ref} needs only an item type`);schema={type:'array',items:resolve(item.item_type_ref)};
    } else if(item.kind==='enum'){
      requireValue(Array.isArray(item.values)&&item.values.length>0&&new Set(item.values).size===item.values.length&&item.fields.length===0&&!item.item_type_ref&&item.openness==='closed','AUTHORING_SEMANTIC',`Enum data type ${ref} needs only unique values`);schema={type:'string',enum:[...item.values]};
    } else {schema=primitiveSchema(item.kind);requireValue(schema&&item.fields.length===0&&!item.item_type_ref&&item.values.length===0&&item.openness==='closed','AUTHORING_SEMANTIC',`Primitive data type ${ref} cannot carry object, list or enum payload`);}
    visiting.delete(ref);cache.set(ref,schema);return structuredClone(schema);
  };
  for(const key of types.keys())resolve(key);
  return resolve;
}
const shapeSchema=(shape,resolveType)=>{
  if(typeof shape==='string')shape={kind:shape,values:[],type_ref:''};
  if(shape?.type_ref){const schema=resolveType(shape.type_ref),expected=shape.kind==='text'||shape.kind==='enum'?'string':shape.kind==='list'?'array':shape.kind;requireValue(schema.type===expected,'AUTHORING_SEMANTIC',`Produced shape ${shape.kind} conflicts with named type ${shape.type_ref}`);return schema;}
  requireValue(object(shape) && ['text','boolean','number','integer','object','list','enum'].includes(shape.kind),'AUTHORING_SEMANTIC','Produced values need a supported semantic shape');
  const primitive=primitiveSchema(shape.kind);if(primitive)return primitive;
  requireValue(Array.isArray(shape.values) && shape.values.length>0 && shape.values.every(value=>['string','number','boolean'].includes(typeof value)),'AUTHORING_SEMANTIC','Enum shapes need bounded scalar values');
  return {type:typeof shape.values[0],enum:[...shape.values]};
};

function validateBlueprint(blueprint,resources){
  requireValue(object(blueprint) && blueprint.contract===PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT && typeof blueprint.purpose==='string' && blueprint.purpose.trim() && object(blueprint.program),'AUTHORING_SEMANTIC','Authoring requires a normalized semantic blueprint');
  const sections=new Set(sourceSectionInventory(resources).map(item=>item.section_id));
  requireValue(Array.isArray(blueprint.source_dispositions) && blueprint.source_dispositions.length===sections.size,'AUTHORING_SEMANTIC','Blueprint must classify every source section exactly once');
  requireValue(blueprint.source_dispositions.every(item=>object(item)&&sections.has(item.section_id)&&['workflow','conditional','reference','omit'].includes(item.disposition)),'AUTHORING_SEMANTIC','Blueprint has an invalid source disposition');
  requireValue(new Set(blueprint.source_dispositions.map(item=>item.section_id)).size===sections.size,'AUTHORING_SEMANTIC','Blueprint source dispositions must be unique');
  requireValue(Array.isArray(blueprint.semantic_rules ?? []) && Array.isArray(blueprint.requirement_assignments ?? []),'AUTHORING_SEMANTIC','Blueprint semantic rule and requirement assignment lists must be arrays');
  return blueprint;
}

function inflateBlueprint(raw){
  requireValue(object(raw)&&raw.contract===PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT,'AUTHORING_SEMANTIC','Authoring requires a normalized semantic blueprint');
  const activities=new Map((raw.activities ?? []).map(item=>[item.key,{...structuredClone(item),continues:item.continues || undefined,consumes:item.consumes.map(consume=>({name:consume.name,from:consume.source_kind==='input'?{input:consume.input}:{activity:consume.activity,output:consume.output}}))}]));
  const approvals=new Map((raw.approvals ?? []).map(item=>[item.key,structuredClone(item)]));
  const sequences=new Map((raw.sequences ?? []).map(item=>[item.key,structuredClone(item)]));
  const parallels=new Map((raw.parallels ?? []).map(item=>[item.key,structuredClone(item)]));
  const choices=new Map((raw.choices ?? []).map(item=>[item.key,structuredClone(item)]));
  const all=[...activities.keys(),...approvals.keys(),...sequences.keys(),...parallels.keys(),...choices.keys()];
  requireValue(new Set(all).size===all.length,'AUTHORING_SEMANTIC','Semantic keys must be unique across activities and control groups');
  const visiting=new Set(),reachable=new Set();
  const resolve=key=>{
    requireValue(!visiting.has(key),'AUTHORING_SEMANTIC',`Semantic control groups contain a cycle at ${key}`);
    reachable.add(key);
    if(activities.has(key))return {kind:'activity',key,activity:activities.get(key)};
    if(approvals.has(key)){const item=approvals.get(key);return {kind:'approval',...item};}
    visiting.add(key);
    let block;
    if(sequences.has(key)){const item=sequences.get(key);block={kind:'sequence',key,steps:item.members.map(resolve)};}
    else if(parallels.has(key)){const item=parallels.get(key);requireValue(item.members.length>=2,'AUTHORING_SEMANTIC','Parallel groups need at least two members');block={kind:'parallel',key,failure_meaning:item.failure_meaning,branches:item.members.map(resolve)};}
    else if(choices.has(key)){
      const item=choices.get(key),decision=resolve(item.decision_activity);
      requireValue(decision.kind==='activity' && decision.activity.kind==='decision','AUTHORING_SEMANTIC',`Choice ${key} must reference a decision activity`);
      block={kind:'choice',key,decision:decision.activity,output:item.output,branches:item.branches.map(branch=>({value:branch.value,body:resolve(branch.body)})),default:resolve(item.default_body)};
    } else requireValue(false,'AUTHORING_SEMANTIC',`Unknown semantic component ${key}`);
    visiting.delete(key);return block;
  };
  const program=resolve(raw.root);
  requireValue(reachable.size===all.length,'AUTHORING_SEMANTIC',`Blueprint has unreachable semantic components: ${all.filter(key=>!reachable.has(key)).join(', ')}`);
  return {...structuredClone(raw),program};
}

export function lowerSemanticBlueprint(pack,resources,rawBlueprint,context={}){
  const blueprint=validateBlueprint(inflateBlueprint(normalizeSemanticBlueprint(rawBlueprint)),resources),resolveType=dataTypeResolver(blueprint.data_types ?? []);
  const inventory=new Map(sourceSectionInventory(resources).map(item=>[item.section_id,item]));
  const observed=new Map(observedSourceRequirements(resources).map(item=>[item.requirement_id,item]));
  const entrypoint=authoringSourcePath(resources),entryLines=Buffer.from(resources[entrypoint] ?? '').toString('utf8').split('\n');
  const supporting=Object.keys(resources).filter(path=>path!==entrypoint);
  const resourceRefsForSections=ids=>[...new Set(ids.flatMap(id=>{const section=inventory.get(id);if(!section||section.source_span.resource!==entrypoint)return [];const text=entryLines.slice(section.source_span.start_line-1,section.source_span.end_line).join('\n').replaceAll('\\','/');return supporting.filter(path=>{const relative=path.startsWith('source/')?path.slice(7):path;return text.includes(path)||text.includes(relative);});}))];
  const executableResource=/\.(?:py|js|mjs|cjs|ts|tsx|sh|bash|ps1|rb|go|rs|java|cs|c|cc|cpp|h|hpp)$/i;
  const routing=context.routing_rules;
  const nodes=[],edges=[],stageIds=new Map(),activityIds=new Map(),activityOutputs=new Map(),compiledBlocks=new Map(),compilingBlocks=new Set(),edgeKeys=new Set();
  let nodeOrdinal=0,edgeOrdinal=0,parallelOrdinal=0,conditionOrdinal=0;
  const nodeId=prefix=>`${prefix}_${String(++nodeOrdinal).padStart(3,'0')}`;
  const addEdge=(source,target,extra={})=>{
    if(source===target)return;
    const {section_ids=[],...semantic}=extra,key=`${source}\u0000${target}\u0000${semantic.label ?? ''}`;
    if(edgeKeys.has(key))return;
    edgeKeys.add(key);edges.push({id:`edge_${String(++edgeOrdinal).padStart(3,'0')}`,source,target,...semantic,confidence:1,source_span:spanFor(section_ids)});
  };
  const spanFor=ids=>{
    const selected=(ids.length?ids:[...inventory.keys()].slice(0,1)).map(id=>{const item=inventory.get(id);requireValue(item,'AUTHORING_SEMANTIC',`Unknown source section ${id}`);return item.source_span;});
    const resourcesUsed=[...new Set(selected.map(item=>item.resource))];requireValue(resourcesUsed.length===1,'AUTHORING_SEMANTIC','One activity cannot cite sections from different source resources');
    return {resource:resourcesUsed[0],start_line:Math.min(...selected.map(item=>item.start_line)),end_line:Math.max(...selected.map(item=>item.end_line))};
  };
  const providerFor=taskType=>routing?.routes?.[taskType]?.provider_id;
  const semanticKeyOf=block=>block.kind==='activity'?block.activity.key:block.key;
  const normalizeActivity=(activity,{decision=false}={})=>{
    requireValue(object(activity)&&localKey(activity.key)&&typeof activity.instructions==='string'&&activity.instructions.trim()&&['main','isolated_worker'].includes(activity.ownership)&&['read','write'].includes(activity.operation)&&Array.isArray(activity.source_sections)&&activity.source_sections.length>0,'AUTHORING_SEMANTIC','Activity needs key, instructions, ownership, operation and source sections');
    requireValue(!stageIds.has(activity.key),'AUTHORING_SEMANTIC',`Duplicate stage key ${activity.key}`);
    activity.source_sections.forEach(id=>requireValue(inventory.has(id),'AUTHORING_SEMANTIC',`Unknown source section ${id}`));
    requireValue(!['start','final','end'].includes(activity.key),'AUTHORING_SEMANTIC',`Activity key ${activity.key} is reserved by the Host`);
    const id=activity.key;stageIds.set(activity.key,id);activityIds.set(activity.key,id);
    const produces=activity.produces ?? [];
    requireValue(Array.isArray(produces)&&new Set(produces.map(item=>item.name)).size===produces.length&&produces.every(item=>object(item)&&localKey(item.name)),'AUTHORING_SEMANTIC','Activity outputs need unique local names');
    const resource_refs=resourceRefsForSections(activity.source_sections),interfaceResources=resource_refs.filter(path=>executableResource.test(path));
    if(interfaceResources.length)for(const output of produces){const shape=output.shape;requireValue(!['object','list'].includes(shape?.kind)||Boolean(shape.type_ref),'AUTHORING_SEMANTIC',`Activity ${activity.key} cites executable resources and must describe structured output ${output.name} with a named data type`);}
    const properties=Object.fromEntries(produces.map(item=>[item.name,shapeSchema(item.shape,resolveType)]));
    const outputs_schema=produces.length?{type:'object',properties,required:Object.keys(properties),additionalProperties:false}:undefined;
    activityOutputs.set(activity.key,new Set(Object.keys(properties)));
    const review=activity.kind==='review';
    const task_type=review?'review':activity.complexity==='complex'?'complex_implementation':activity.operation==='write'?'implementation':'planning';
    const tool=activity.capability?.kind==='registered_tool';
    requireValue(!tool || localKey(activity.capability.semantic_name),'AUTHORING_SEMANTIC','Registered-tool activities need one exact semantic tool name');
    const node=tool
      ? {id,type:'tool',name:activity.purpose ?? activity.key,tool:activity.capability.semantic_name,resource_refs,confidence:1,source_span:spanFor(activity.source_sections)}
      : {id,type:'agent',name:activity.purpose ?? activity.key,operation_mode:activity.operation,task_type,routing_reason:`Host classified ${activity.key} from semantic kind, operation and complexity.`,prompt_template:activity.instructions,...(outputs_schema?{outputs_schema}:{}),resource_refs,confidence:1,source_span:spanFor(activity.source_sections)};
    if(!tool && routing?.selection_mode==='automatic'){
      node.execution_target=activity.ownership==='main'?'main':'thread';
      if(node.execution_target==='thread'){node.provider_choice=providerFor(task_type);node.thread_lifecycle='start';}
    }
    nodes.push(node);
    return {entries:[id],exits:[id],sections:activity.source_sections,decision};
  };
  const compileBlock=block=>{
    requireValue(object(block)&&['sequence','parallel','choice','approval','activity'].includes(block.kind),'AUTHORING_SEMANTIC','Program block kind is invalid');
    const semanticKey=semanticKeyOf(block);
    requireValue(localKey(semanticKey),'AUTHORING_SEMANTIC','Program blocks need stable semantic keys');
    if(compiledBlocks.has(semanticKey))return compiledBlocks.get(semanticKey);
    requireValue(!compilingBlocks.has(semanticKey),'AUTHORING_SEMANTIC',`Semantic control groups contain a cycle at ${semanticKey}`);
    compilingBlocks.add(semanticKey);
    let result;
    if(block.kind==='activity')result=normalizeActivity(block.activity);
    else if(block.kind==='approval'){
      requireValue(localKey(block.key)&&!stageIds.has(block.key)&&typeof block.question==='string'&&block.question.trim()&&Array.isArray(block.source_sections)&&block.source_sections.length>0,'AUTHORING_SEMANTIC','Approval needs a unique key, question and source sections');
      const id=nodeId('approval');stageIds.set(block.key,id);nodes.push({id,type:'human_gate',name:'Human approval',prompt_template:block.question,confidence:1,source_span:spanFor(block.source_sections)});result={entries:[id],exits:[id],sections:block.source_sections};
    }
    else if(block.kind==='sequence'){
      requireValue(Array.isArray(block.steps)&&block.steps.length>0,'AUTHORING_SEMANTIC','Sequence needs at least one step');
      const parts=block.steps.map(compileBlock);for(let index=1;index<parts.length;index++)for(const source of parts[index-1].exits)for(const target of parts[index].entries)addEdge(source,target,{section_ids:parts[index].sections});
      result={entries:parts[0].entries,exits:parts.at(-1).exits,sections:[...new Set(parts.flatMap(item=>item.sections))]};
    }
    else if(block.kind==='parallel'){
      requireValue(Array.isArray(block.branches)&&block.branches.length>=2,'AUTHORING_SEMANTIC','Parallel needs at least two branches');
      const pair=String(++parallelOrdinal).padStart(3,'0'),fork=nodeId('parallel'),join=nodeId('join');
      const parts=block.branches.map(compileBlock),sections=[...new Set(parts.flatMap(item=>item.sections))];
      nodes.push({id:fork,type:'parallel',join_id:join,failure_policy:block.failure_meaning==='partial_evidence_allowed'?'collect':'fail_fast',confidence:1,source_span:spanFor(sections)});
      nodes.push({id:join,type:'join',parallel_id:fork,confidence:1,source_span:spanFor(sections)});
      parts.forEach((part,index)=>{for(const target of part.entries)addEdge(fork,target,{label:`branch_${index+1}`,section_ids:part.sections});for(const source of part.exits)addEdge(source,join,{section_ids:part.sections});});
      result={entries:[fork],exits:[join],sections};
    }
    else {
      requireValue(object(block.decision)&&Array.isArray(block.branches)&&block.branches.length>0&&object(block.default),'AUTHORING_SEMANTIC','Choice needs a decision, branches and default block');
      const decisionPrecompiled=compiledBlocks.has(block.decision.key),decision=compileBlock({kind:'activity',key:block.decision.key,activity:block.decision});
      const outputName=block.output;requireValue(localKey(outputName)&&activityOutputs.get(block.decision.key)?.has(outputName),'AUTHORING_SEMANTIC','Choice output must name one declared decision output');
      const fallbackKey=semanticKeyOf(block.default),fallback=compileBlock(block.default),groups=new Map();
      for(const item of block.branches){
        const key=semanticKeyOf(item.body);
        if(key===fallbackKey)continue;
        const group=groups.get(key) ?? {body:item.body,values:[]};group.values.push(item.value);groups.set(key,group);
      }
      const parts=[...groups.values()].map(item=>({...item,part:compileBlock(item.body)})),sections=[...new Set([...decision.sections,...parts.flatMap(item=>item.part.sections),...fallback.sections])];
      if(parts.length===0){
        for(const source of decision.exits)for(const target of fallback.entries)addEdge(source,target,{section_ids:fallback.sections});
        result={entries:decisionPrecompiled?fallback.entries:decision.entries,exits:fallback.exits,sections};
      } else {
        const route=nodeId('condition'),path={path:`/nodes/${decision.entries[0]}/output/${outputName}`},labels=parts.map((_,index)=>`case_${index+1}`);
        nodes.push({id:route,type:'condition',cases:parts.map((item,index)=>({label:labels[index],when:item.values.length===1?{op:'eq',args:[path,{value:item.values[0]}]}:{op:'or',args:item.values.map(value=>({op:'eq',args:[path,{value}]}))}})),default_label:'default',confidence:1,source_span:spanFor(sections)});
        addEdge(decision.exits[0],route,{section_ids:decision.sections});parts.forEach(({part},index)=>part.entries.forEach(target=>addEdge(route,target,{label:labels[index],section_ids:part.sections})));fallback.entries.forEach(target=>addEdge(route,target,{label:'default',section_ids:fallback.sections}));
        result={entries:decisionPrecompiled?[route]:decision.entries,exits:[...new Set([...parts.flatMap(item=>item.part.exits),...fallback.exits])],sections};
      }
    }
    compilingBlocks.delete(semanticKey);compiledBlocks.set(semanticKey,result);return result;
  };
  const program=compileBlock(blueprint.program);
  for(const [key,id] of activityIds){
    const activity=findActivity(blueprint.program,key);const bindings={task:'/inputs/task'};
    for(const consume of activity?.consumes ?? []){
      requireValue(object(consume)&&localKey(consume.name)&&object(consume.from),'AUTHORING_SEMANTIC','Activity consumption needs a named source');
      if(consume.from.input)bindings[consume.name]=`/inputs/${consume.from.input}`;
      else {const producer=activityIds.get(consume.from.activity);requireValue(producer&&activityOutputs.get(consume.from.activity)?.has(consume.from.output),'AUTHORING_SEMANTIC','Consumed activity output is unknown');bindings[consume.name]=`/nodes/${producer}/output/${consume.from.output}`;}
    }
    nodes.find(item=>item.id===id).input_bindings=bindings;
  }
  for(const activity of blueprint.activities ?? [])if(activity.continues){
    const source=nodes.find(node=>node.id===activityIds.get(activity.key)),target=nodes.find(node=>node.id===activityIds.get(activity.continues));
    const direct=source&&target&&edges.some(edge=>edge.source===source.id&&edge.target===target.id&&(edge.on ?? 'success')==='success');
    if(direct&&source.execution_target==='thread'&&target.execution_target==='thread'&&source.provider_choice===target.provider_choice){target.thread_lifecycle='continue';target.thread_source_node=source.id;}
  }
  addEdge('start',program.entries[0],{section_ids:program.sections});for(const source of program.exits)addEdge(source,'final',{section_ids:program.sections});
  const rules=(blueprint.semantic_rules ?? []).map((item,index)=>{
    requireValue(inventory.has(item.section_id)&&typeof item.statement==='string'&&item.statement.trim()&&Array.isArray(item.activity_keys)&&item.activity_keys.length>0,'AUTHORING_SEMANTIC','Semantic rules need source evidence, statement and responsible activities');
    return {requirement_id:`semantic_rule_${String(index+1).padStart(3,'0')}`,requirement_kind:'agent_judgment',source_spans:[inventory.get(item.section_id).source_span],trigger:item.applies_when || 'source_semantic_rule',required_result:item.statement,resource_refs:resourceRefsForSections([item.section_id]),details:{},activity_keys:item.activity_keys};
  });
  const mappings=rules.map(item=>({requirement_id:item.requirement_id,node_ids:item.activity_keys.map(key=>{const id=stageIds.get(key);requireValue(id,'AUTHORING_SEMANTIC',`Unknown stage ${key}`);return id;}),binding_names:[],runtime_guards:[],resource_refs:[...item.resource_refs],status:'agent_assisted',rationale:'Mapped from the semantic blueprint.'})),assignmentIds=new Set(),successEdges=edges.filter(edge=>(edge.on ?? 'success')==='success');
  const reaches=(source,target)=>{const seen=new Set(),queue=[source];while(queue.length){const current=queue.shift();if(current===target)return true;if(seen.has(current))continue;seen.add(current);queue.push(...successEdges.filter(edge=>edge.source===current).map(edge=>edge.target));}return false;};
  rules.forEach(item=>delete item.activity_keys);
  for(const item of blueprint.requirement_assignments ?? []){
    requireValue(!assignmentIds.has(item.requirement_id)&&Array.isArray(item.activity_keys)&&item.activity_keys.length>0,'AUTHORING_SEMANTIC','Requirement assignments must be unique and name responsible semantic activities');assignmentIds.add(item.requirement_id);
    if(/^semantic_rule_\d+$/.test(item.requirement_id))continue;
    const requirement=observed.get(item.requirement_id);requireValue(requirement,'AUTHORING_SEMANTIC','Observed requirement assignments must name a known requirement');
    let keys=[...new Set(item.activity_keys)];
    if(requirement.requirement_kind==='approval'&&!keys.some(key=>nodes.find(node=>node.id===stageIds.get(key))?.type==='human_gate')){
      const sectionIds=[...inventory].filter(([,section])=>(requirement.source_spans ?? []).some(span=>span.resource===section.source_span.resource&&span.start_line<=section.source_span.end_line&&span.end_line>=section.source_span.start_line)).map(([id])=>id);
      const candidates=(blueprint.approvals ?? []).filter(approval=>approval.source_sections.some(id=>sectionIds.includes(id))).map(approval=>approval.key);
      if(candidates.length===1){const gate=candidates[0],gateId=stageIds.get(gate);keys=keys.filter(key=>{const id=stageIds.get(key);return id&&reaches(gateId,id);});keys.push(gate);}
    }
    mappings.push({requirement_id:item.requirement_id,node_ids:keys.map(key=>{const id=stageIds.get(key);requireValue(id,'AUTHORING_SEMANTIC',`Unknown stage ${key}`);return id;}),binding_names:item.binding_names ?? [],runtime_guards:item.runtime_guards ?? [],resource_refs:[...(requirement.resource_refs ?? [])],status:'agent_assisted',rationale:'Mapped from the semantic blueprint.'});
  }
  const source_dispositions=blueprint.source_dispositions.map(item=>({section_id:item.section_id,disposition:item.disposition,node_ids:(item.activity_keys ?? []).map(key=>{const id=stageIds.get(key);requireValue(id,'AUTHORING_SEMANTIC',`Unknown stage ${key}`);return id;}),requirement_ids:[],...(item.trigger?{trigger:item.trigger}:{}),rationale:item.reason || `Classified ${item.section_id} as ${item.disposition}.`}));
  const proposal={source_revision:pack.revision_hash,source_requirements:rules,requirement_mappings:mappings,source_dispositions,required_executables:[],planning_analysis:{parallelism:'Host-derived from nested semantic blocks.',main_responsibilities:'Host-derived from activity ownership.',human_intervention:'Host-derived from approval blocks.'},nodes,edges};
  return proposal;
}

function findActivity(block,key){
  if(block.kind==='activity'&&block.activity?.key===key)return block.activity;
  if(block.kind==='choice'&&block.decision?.key===key)return block.decision;
  const children=block.kind==='sequence'?block.steps:block.kind==='parallel'?block.branches:block.kind==='choice'?[...block.branches.map(item=>item.body),block.default]:[];
  for(const child of children){const found=findActivity(child,key);if(found)return found;}return null;
}

export class WorkflowForge{
  compile({pack,resources,blueprint,context={}}){
    const proposal=lowerSemanticBlueprint(pack,resources,blueprint,context);
    const compiled=compileExpansion(pack,resources,proposal,context);
    return {proposal:compiled.canonical_proposal,compiled};
  }
}
