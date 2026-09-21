import { CONVERSION_CONTRACT } from './conversion-contract.mjs';
import { requireValue } from '../workflow-paths.mjs';
import { mergeSourceRequirements, observedSourceRequirements, projectObservedRequirements } from './source-requirements.mjs';
import { validateSourceDispositions } from './source-dispositions.mjs';

export const REVIEW_IDS = CONVERSION_CONTRACT.checks.map(check=>check.id);
const V2_REVIEW_IDS = ['parallelism','agent_ownership','human_intervention','model_selection','phase_order','hard_rules','data_handoffs','failure_semantics','conversation_inputs','human_confirmation','conditional_dependencies','portable_artifact','source_support','review_scope'];
const V3_REVIEW_IDS = ['parallelism','agent_ownership','human_intervention','model_selection','phase_order','hard_rules','requirement_coverage','data_handoffs','failure_semantics','conversation_inputs','human_confirmation','conditional_dependencies','portable_artifact','source_support','review_scope'];
const V4_REVIEW_IDS = ['parallelism','agent_ownership','human_intervention','model_selection','phase_order','hard_rules','requirement_coverage','data_handoffs','failure_semantics','conversation_inputs','human_confirmation','conditional_dependencies','portable_artifact','source_support','review_scope','artifact_interface_contract','method_fidelity','dependency_binding','validation_strength','cross_resource_consistency'];
const V5_TO_V7_REVIEW_IDS = [...V4_REVIEW_IDS.slice(0,16),'host_canonicalization',...V4_REVIEW_IDS.slice(16)];
export function reviewIds(version = CONVERSION_CONTRACT.version) {
  requireValue(Number.isInteger(version) && version>=2 && version<=CONVERSION_CONTRACT.version,'GENERATION_REVIEW_VERSION','Unsupported generation review contract version');
  if (version === 2) return V2_REVIEW_IDS;
  if (version === 3) return V3_REVIEW_IDS;
  if (version === 4) return V4_REVIEW_IDS;
  if ([5,6,7].includes(version)) return V5_TO_V7_REVIEW_IDS;
  return REVIEW_IDS;
}
const strings = {type:'array',maxItems:800,items:{type:'string',minLength:1,maxLength:128}};
export function reviewSchema(version = CONVERSION_CONTRACT.version) { const ids=reviewIds(version); return {type:'object',required:['checks'],additionalProperties:false,properties:{checks:{type:'array',minItems:ids.length,maxItems:ids.length,items:{
  type:'object',required:['id','status','evidence','node_ids','edge_ids','source_spans'],additionalProperties:false,properties:{
    id:{type:'string',enum:ids},status:{type:'string',enum:['pass','fail','not_applicable']},evidence:{type:'string',minLength:1,maxLength:4000},
    node_ids:strings,edge_ids:strings,source_spans:{type:'array',maxItems:200,items:{type:'object',required:['resource','start_line','end_line'],additionalProperties:false,properties:{resource:{type:'string',minLength:1,maxLength:1024},start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1}}}},
  },
}}}}; }
export const REVIEW_SCHEMA = reviewSchema(CONVERSION_CONTRACT.version);

// Portable-artifact evidence can legitimately be a graph-only portability
// conclusion when the source declares no path contract. Drop a bad optional
// citation there instead of retrying the whole review merely to repair a line
// number. Every other check remains fail-closed on malformed source evidence;
// mandatory checks also fail below if no valid span remains.
const OPTIONAL_SOURCE_EVIDENCE = new Set(['portable_artifact']);
export function normalizeReviewEvidence(value, resources) {
  if (!value || typeof value!=='object' || !Array.isArray(value.checks)) return value;
  const normalized=structuredClone(value);
  for (const row of normalized.checks) if (OPTIONAL_SOURCE_EVIDENCE.has(row?.id) && Array.isArray(row.source_spans)) row.source_spans=row.source_spans.filter(span=>{
    const bytes=span && Object.hasOwn(resources,span.resource) ? resources[span.resource] : null;
    return Boolean(bytes && Object.keys(span).length===3 && Number.isInteger(span.start_line) && Number.isInteger(span.end_line)
      && span.start_line>=1 && span.end_line>=span.start_line && span.end_line<=bytes.toString('utf8').split('\n').length);
  });
  return normalized;
}

function deterministicFindings(proposal, resources, version) {
  if(version>=8)proposal = projectObservedRequirements(proposal, resources);
  const requirements = version>=8 ? mergeSourceRequirements(observedSourceRequirements(resources), proposal.source_requirements ?? []) : (proposal.source_requirements ?? []);
  const nodes = new Map((proposal.nodes ?? []).map(node => [node.id, node]));
  const mappings = new Map((proposal.requirement_mappings ?? []).map(mapping => [mapping.requirement_id, mapping]));
  const findings = [];
  for (const requirement of requirements) {
    const mapping = mappings.get(requirement.requirement_id);
    if (!mapping) { findings.push(`[requirement_coverage] ${requirement.requirement_id} has no mapping.`); continue; }
    const mapped = (mapping.node_ids ?? []).map(id => nodes.get(id)).filter(Boolean);
    if ((mapping.node_ids ?? []).length !== mapped.length) findings.push(`[requirement_coverage] ${requirement.requirement_id} maps an unknown node.`);
    if (mapping.status === 'unsupported') findings.push(`[requirement_coverage] ${requirement.requirement_id} remains unsupported and cannot pass the v4 conversion gate.`);
    if (mapping.status === 'agent_assisted' && mapping.rationale?.startsWith('Host-projected to resource-consuming nodes because the planner supplied no semantic mapping')) findings.push(`[requirement_coverage] ${requirement.requirement_id} was routed to review without a planner-supplied semantic mapping.`);
    if (mapping.status === 'compiled') {
      if (!mapped.length || mapped.some(node => !(node.requirement_ids ?? []).includes(requirement.requirement_id))) findings.push(`[validation_strength] ${requirement.requirement_id} is compiled without explicit node requirement_ids.`);
      if (!(mapping.binding_names ?? []).every(name => mapped.some(node => Object.hasOwn(node.input_bindings ?? {}, name) || Object.hasOwn(node.outputs_schema?.properties ?? {},name)))) findings.push(`[data_handoffs] ${requirement.requirement_id} names a binding absent from mapped inputs and outputs.`);
      if (requirement.requirement_kind === 'artifact_path' && !mapped.some(node => node.type === 'tool' || (node.type === 'agent' && node.operation_mode === 'write'))) findings.push(`[artifact_interface_contract] ${requirement.requirement_id} has no concrete write producer.`);
      if (requirement.requirement_kind === 'canonicalization' && !mapped.some(node => node.type === 'tool')) findings.push(`[host_canonicalization] ${requirement.requirement_id} is marked compiled without a pre-authorized host-tool node.`);
      if (requirement.requirement_kind === 'method_rule' && !mapped.some(node => node.type === 'tool' || (node.resource_refs ?? []).some(ref => (requirement.resource_refs ?? []).includes(ref)))) findings.push(`[method_fidelity] ${requirement.requirement_id} does not project its pinned method reference.`);
      if (requirement.requirement_kind === 'dependency' && !requirement.details?.executable) findings.push(`[dependency_binding] ${requirement.requirement_id} has no typed executable.`);
    }
  }
  if (version >= 8) for (const finding of validateSourceDispositions(proposal,resources)) findings.push(`[source_disposition] ${finding.section_id ?? 'source'}: ${finding.reason}`);
  return findings;
}

// Model review is evidence gathering.  Deterministic coverage is merged below,
// so an all-pass model result can never override a missing contract.
export function evaluateReview(value, proposal, resources, {version = CONVERSION_CONTRACT.version} = {}) {
  value = normalizeReviewEvidence(value,resources);
  if(version>=8)proposal = projectObservedRequirements(proposal, resources);
  const ids=reviewIds(version);
  const check=(condition,message)=>requireValue(condition,'GENERATION_CHECKLIST_INVALID',message);
  check(value && Object.keys(value).length===1 && Array.isArray(value.checks) && value.checks.length===ids.length,'Return every checklist ID exactly once; no self-declared approved field');
  const nodes=new Set(proposal.nodes.map(n=>n.id));const edges=new Set(proposal.edges.map(e=>e.id));const seen=new Set();
  const sourceRequirements=version >= 8 ? mergeSourceRequirements(observedSourceRequirements(resources),proposal.source_requirements ?? []) : (proposal.source_requirements ?? []);const mappings=proposal.requirement_mappings ?? [];
  const approvalRequired=sourceRequirements.some(item=>item.requirement_kind==='approval');
  for(const row of value.checks){
    check(row && ids.includes(row.id) && !seen.has(row.id),'Unknown or duplicate checklist ID');seen.add(row.id);
    check(Object.keys(row).length===6 && ['pass','fail','not_applicable'].includes(row.status) && typeof row.evidence==='string' && row.evidence.trim() && row.evidence.length<=4000,`Invalid result/evidence for ${row.id}`);
    for(const [field,known] of [['node_ids',nodes],['edge_ids',edges]])check(Array.isArray(row[field]) && row[field].length<=800 && new Set(row[field]).size===row[field].length && row[field].every(id=>known.has(id)),`Invalid ${field} in ${row.id}`);
    check(Array.isArray(row.source_spans) && row.source_spans.length<=200,`Missing source spans in ${row.id}`);
    for(const span of row.source_spans){const bytes=span && Object.hasOwn(resources,span.resource)?resources[span.resource]:null;
      check(bytes && Object.keys(span).length===3 && Number.isInteger(span.start_line) && Number.isInteger(span.end_line) && span.start_line>=1 && span.end_line>=span.start_line && span.end_line<=bytes.toString('utf8').split('\n').length,`Invalid source evidence in ${row.id}`);
    }
    const typedChecks = {artifact_interface_contract:'artifact_path',host_canonicalization:'canonicalization',method_fidelity:'method_rule',dependency_binding:'dependency',validation_strength:null,cross_resource_consistency:null};
    if(row.status==='not_applicable') {
      const kind = typedChecks[row.id];
      const hasTyped = kind ? sourceRequirements.some(item=>item.requirement_kind===kind) : sourceRequirements.some(item=>['artifact_path','artifact_schema','canonicalization','method_rule','dependency'].includes(item.requirement_kind));
      check((['conversation_inputs','human_confirmation','conditional_dependencies'].includes(row.id) && !(row.id==='human_confirmation' && approvalRequired)) || (version >= 4 && Object.hasOwn(typedChecks,row.id) && !hasTyped),`Rule ${row.id} cannot be marked not applicable`);
    }
    if(['phase_order','hard_rules','requirement_coverage','source_support','source_disposition'].includes(row.id))check(row.source_spans.length>0,`Rule ${row.id} needs source evidence`);
    if(row.id==='source_support')check([...nodes].every(id=>row.node_ids.includes(id)) && [...edges].every(id=>row.edge_ids.includes(id)),'Source-support review must cover every proposed node and edge');
  }
  const findings=[...(version >= 4 ? deterministicFindings(proposal,resources,version) : []),...value.checks.filter(c=>c.status==='fail').map(c=>`[${c.id}] ${c.evidence}`)];
  if(approvalRequired && !proposal.nodes.some(node=>node.type==='human_gate'))findings.push('[requirement_coverage] A source approval requirement has no human_gate.');
  const mapped=new Set(mappings.map(item=>item.requirement_id));
  for(const requirement of sourceRequirements)if(!mapped.has(requirement.requirement_id))findings.push(`[requirement_coverage] ${requirement.requirement_id} has no mapping.`);
  return {approved:findings.length===0,findings,checks:value.checks};
}
