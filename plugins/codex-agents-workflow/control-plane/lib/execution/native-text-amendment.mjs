import {requireValue} from '../workflow-paths.mjs';
import {validateData} from '../workflow-data-schema.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=message=>requireValue(false,'NATIVE_TEXT_AMENDMENT',message);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key))&&keys.every(key=>Object.hasOwn(value,key));

// Physical lines include their CRLF, LF or CR separator. A trailing separator
// ends its line; it does not manufacture an additional empty physical line.
export function textLineBoundaries(text){
  requireValue(typeof text==='string'&&Buffer.from(text,'utf8').toString('utf8')===text,'NATIVE_TEXT_AMENDMENT','The sealed text field must be exact well-formed UTF8 text');
  const ends=[];const separators=/\r\n|\r|\n/g;let match;
  while((match=separators.exec(text)))ends.push(match.index+match[0].length);
  if(!ends.length||ends.at(-1)<text.length)ends.push(text.length);
  return [0,...ends];
}
export const textLineCount=text=>textLineBoundaries(text).length-1;

export function validateTextAmendmentDeclaration(node,tool,nativeWorker){
  const config=node.completion_contract?.host_check?.text_amendment;if(config===undefined)return;
  const mainItemWorker=node.executor?.kind==='main'&&node.executor.mode==='worker'&&node.fanout?.result_mode==='per_item'&&node.fanout.distribution==='one_per_item';
  requireValue((nativeWorker||mainItemWorker)&&(!node.fanout||!node.fanout.shared_change_field&&(node.fanout.distribution==='one_per_item'||node.fanout.item_delivery==='incremental')),
    'NATIVE_TEXT_AMENDMENT_MODE','Text amendments require a Cooperative native worker with one current completed-result item per child turn; delegated shared-change results are unsupported');
  const schema=node.fanout?node.outputs_schema?.properties?.[node.fanout.result_output]?.items:node.outputs_schema;
  requireValue(exact(config,['fields','repair_scope_field','max_edits','max_replacement_bytes'])&&Array.isArray(config.fields)&&config.fields.length>0&&config.fields.length<=64
    &&new Set(config.fields).size===config.fields.length&&config.fields.every(field=>typeof field==='string'&&schema?.properties?.[field]?.type==='string'&&schema.required?.includes(field))
    &&typeof config.repair_scope_field==='string'&&Number.isSafeInteger(config.max_edits)&&config.max_edits>=1&&config.max_edits<=64
    &&Number.isSafeInteger(config.max_replacement_bytes)&&config.max_replacement_bytes>=1&&config.max_replacement_bytes<=2*1024*1024,
  'NATIVE_TEXT_AMENDMENT_CONTRACT','Text amendment fields must be required top-level strings with bounded edit and byte limits');
  const scope=tool.output_schema?.properties?.[config.repair_scope_field];
  requireValue(tool.output_schema.required?.includes(config.repair_scope_field)&&scope?.type==='object'&&scope.additionalProperties===false
    &&!(scope.required?.length)&&object(scope.properties)&&Object.keys(scope.properties).length===config.fields.length&&config.fields.every(field=>{
      const ranges=scope.properties[field],item=ranges?.items;
      return ranges?.type==='array'&&item?.type==='object'&&item.additionalProperties===false&&object(item.properties)
        &&Object.keys(item.properties).sort().join(',')==='end_line,start_line'&&item.required?.length===2&&['start_line','end_line'].every(key=>item.required.includes(key)&&item.properties[key].type==='integer'&&item.properties[key].minimum>=1);
    }), 'NATIVE_TEXT_AMENDMENT_SCOPE_SCHEMA','The checker must return a required typed scope object with only declared fields and exact positive line ranges');
}

export function validateTextRepairScope(baseline,scope,config){
  if(!object(scope)||!Object.keys(scope).length)fail('Rejected text needs a nonempty typed repair scope');
  let count=0;
  for(const [field,ranges]of Object.entries(scope)){
    if(!config.fields.includes(field)||!Array.isArray(ranges)||!ranges.length)fail('Repair scope contains an undeclared field or empty ranges');
    const lines=textLineCount(baseline[field]);let last=0;
    for(const range of ranges){
      if(!exact(range,['start_line','end_line'])||!Number.isSafeInteger(range.start_line)||!Number.isSafeInteger(range.end_line)
        ||range.start_line<=last||range.end_line<range.start_line||range.end_line>lines)fail('Repair scope has overlapping, unordered or out-of-bounds physical lines');
      last=range.end_line;count++;
    }
  }
  if(count>64)fail('Repair scope exceeds 64 disjoint ranges');
  return scope;
}

export function textAmendmentSchema(config){
  return {type:'object',properties:{amendments:{type:'array',minItems:1,maxItems:config.max_edits,items:{type:'object',additionalProperties:false,
    properties:{field:{type:'string',enum:config.fields},start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1},replacement:{type:'string',description:'Exact replacement text for complete physical lines, including explicit separators. Nonempty non-EOF replacement must end with CRLF, LF or CR.'}},
    required:['field','start_line','end_line','replacement']}}},required:['amendments'],additionalProperties:false};
}

export function applyTextAmendment(baseline,scope,config,payload){
  validateTextRepairScope(baseline,scope,config);
  try{validateData(payload,textAmendmentSchema(config));}catch(error){if(error.code!=='DATA_INVALID')throw error;fail(error.message);}
  const byField=new Map();let bytes=0;
  for(const edit of payload.amendments){
    if(Buffer.from(edit.replacement,'utf8').toString('utf8')!==edit.replacement)fail('Replacement must be exact well-formed UTF8 text');
    bytes+=Buffer.byteLength(edit.replacement,'utf8');
    if(bytes>config.max_replacement_bytes)fail('Replacement UTF8 bytes exceed the pinned limit');
    if(edit.end_line<edit.start_line||!Object.hasOwn(scope,edit.field)||!scope[edit.field].some(range=>edit.start_line>=range.start_line&&edit.end_line<=range.end_line))fail('Edit leaves the sealed rejected field or line scope');
    const boundaries=textLineBoundaries(baseline[edit.field]);
    if(edit.end_line<boundaries.length-1&&edit.replacement&&!/[\r\n]$/.test(edit.replacement))fail('Non-EOF replacement must end with an explicit physical line separator');
    const edits=byField.get(edit.field)??[];
    if(edits.length&&edit.start_line<=edits.at(-1).end_line)fail('Edits must be ordered and nonoverlapping within each field');
    edits.push(edit);byField.set(edit.field,edits);
  }
  const merged=structuredClone(baseline);
  for(const [field,edits]of byField){
    const text=baseline[field],boundaries=textLineBoundaries(text);let cursor=0,parts=[];
    for(const edit of edits){const start=boundaries[edit.start_line-1],end=boundaries[edit.end_line];parts.push(text.slice(cursor,start),edit.replacement);cursor=end;}
    merged[field]=parts.join('')+text.slice(cursor);
  }
  return merged;
}
