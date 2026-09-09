import { CONVERSION_CONTRACT } from './conversion-contract.mjs';
import { requireValue } from '../workflow-paths.mjs';

export const REVIEW_IDS = CONVERSION_CONTRACT.checks.map(check=>check.id);
const strings = {type:'array',maxItems:800,items:{type:'string',minLength:1,maxLength:128}};
export const REVIEW_SCHEMA = {type:'object',required:['checks'],additionalProperties:false,properties:{checks:{type:'array',minItems:REVIEW_IDS.length,maxItems:REVIEW_IDS.length,items:{
  type:'object',required:['id','status','evidence','node_ids','edge_ids','source_spans'],additionalProperties:false,properties:{
    id:{type:'string',enum:REVIEW_IDS},status:{type:'string',enum:['pass','fail','not_applicable']},evidence:{type:'string',minLength:1,maxLength:4000},
    node_ids:strings,edge_ids:strings,source_spans:{type:'array',maxItems:200,items:{type:'object',required:['resource','start_line','end_line'],additionalProperties:false,properties:{resource:{type:'string',minLength:1,maxLength:1024},start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1}}}},
  },
}}}};

// Checks completeness and reference integrity, not the truth of model reasoning.
export function evaluateReview(value, proposal, resources) {
  const check=(condition,message)=>requireValue(condition,'GENERATION_CHECKLIST_INVALID',message);
  check(value && Object.keys(value).length===1 && Array.isArray(value.checks) && value.checks.length===REVIEW_IDS.length,'Return every checklist ID exactly once; no self-declared approved field');
  const nodes=new Set(proposal.nodes.map(n=>n.id));const edges=new Set(proposal.edges.map(e=>e.id));const seen=new Set();
  for(const row of value.checks){
    check(row && REVIEW_IDS.includes(row.id) && !seen.has(row.id),'Unknown or duplicate checklist ID');seen.add(row.id);
    check(Object.keys(row).length===6 && ['pass','fail','not_applicable'].includes(row.status) && typeof row.evidence==='string' && row.evidence.trim() && row.evidence.length<=4000,`Invalid result/evidence for ${row.id}`);
    for(const [field,known] of [['node_ids',nodes],['edge_ids',edges]])check(Array.isArray(row[field]) && row[field].length<=800 && new Set(row[field]).size===row[field].length && row[field].every(id=>known.has(id)),`Invalid ${field} in ${row.id}`);
    check(Array.isArray(row.source_spans) && row.source_spans.length<=200,`Missing source spans in ${row.id}`);
    for(const span of row.source_spans){const bytes=span && Object.hasOwn(resources,span.resource)?resources[span.resource]:null;
      check(bytes && Object.keys(span).length===3 && Number.isInteger(span.start_line) && Number.isInteger(span.end_line) && span.start_line>=1 && span.end_line>=span.start_line && span.end_line<=bytes.toString('utf8').split('\n').length,`Invalid source evidence in ${row.id}`);
    }
    if(row.status==='not_applicable')check(['conversation_inputs','human_confirmation','conditional_dependencies'].includes(row.id) && !(row.id==='human_confirmation' && proposal.nodes.some(n=>n.type==='human_gate')),`Rule ${row.id} cannot be marked not applicable`);
    if(['phase_order','hard_rules','source_support'].includes(row.id))check(row.source_spans.length>0,`Rule ${row.id} needs source evidence`);
    if(row.id==='source_support')check([...nodes].every(id=>row.node_ids.includes(id)) && [...edges].every(id=>row.edge_ids.includes(id)),'Source-support review must cover every proposed node and edge');
  }
  const findings=value.checks.filter(c=>c.status==='fail').map(c=>`[${c.id}] ${c.evidence}`);
  return {approved:findings.length===0,findings,checks:value.checks};
}
