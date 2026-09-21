import { requireValue } from '../workflow-paths.mjs';
import { decodeGeneratedEnvelope, decodeGeneratedProposalDetailed } from './expansion-run.mjs';
import { canonicalJSON } from '../workflow-revisions.mjs';
import { projectObservedRequirements } from './source-requirements.mjs';
import { compileExpansion } from './semantic-expander.mjs';
import { sourceSectionInventory, validateSourceDispositions } from './source-dispositions.mjs';
import { applySemanticRepair, INTERNAL_SEMANTIC_BLUEPRINT_SCHEMA, LEGACY_SEMANTIC_BLUEPRINT_CONTRACT, normalizeSemanticBlueprint, PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT, SEMANTIC_BLUEPRINT_CONTRACT, SEMANTIC_BLUEPRINT_SCHEMA, SEMANTIC_REPAIR_CONTRACT, SEMANTIC_REPAIR_SCHEMA } from '../authoring/blueprint-contract.mjs';
import { lowerSemanticBlueprint } from '../authoring/workflow-forge.mjs';
import { validateData } from '../workflow-data-schema.mjs';

function missingContractFields(proposal) {
  const findings=[];
  if (!Object.hasOwn(proposal ?? {},'required_executables')) findings.push({field:'required_executables',reason:'Host executable projection is missing.'});
  for (const node of proposal?.nodes ?? []) if (['agent','tool','human_gate'].includes(node.type)) {
    for (const field of ['input_bindings','resource_refs','requirement_ids']) if (!Object.hasOwn(node,field)) findings.push({node_id:node.id,field,reason:'Current conversion nodes require an explicit host/model projection.'});
  }
  return findings;
}

export function deterministicProposalFindings(proposal,compiled,version,resources={}) {
  const findings=[];
  if (version>=6) findings.push(...missingContractFields(proposal));
  if (version>=4) {
    findings.push(...compiled.workflow.import_status.requirement_coverage.filter(item=>item.status==='unsupported'));
    for(const mapping of proposal.requirement_mappings ?? []) if(mapping.rationale?.startsWith('Host-projected to resource-consuming nodes because the planner supplied no semantic mapping')) findings.push({requirement_id:mapping.requirement_id,status:'fallback_review',reason:'A deterministic source requirement has no planner-supplied semantic mapping.'});
  }
  if (version>=8) findings.push(...validateSourceDispositions(proposal,resources));
  return findings;
}

// One deterministic gate shared by pre-review, persisted-artifact recheck and
// final apply.  No caller may maintain a weaker copy of the conversion rules.
export function validateGenerationProposal(output,{pack,resources,provenance,context,previousPlan=null}) {
  const payload=decodeGeneratedEnvelope(output);
  const semanticContracts=[SEMANTIC_BLUEPRINT_CONTRACT,PREVIOUS_SEMANTIC_BLUEPRINT_CONTRACT,LEGACY_SEMANTIC_BLUEPRINT_CONTRACT,SEMANTIC_REPAIR_CONTRACT];
  const decodedResult=semanticContracts.includes(payload?.contract)
    ? (()=>{
      let authoringPlan=null,semantic=payload,repairs=[];
      if(payload.contract===SEMANTIC_REPAIR_CONTRACT){
        validateData(payload,SEMANTIC_REPAIR_SCHEMA);
        requireValue(previousPlan?.contract===SEMANTIC_BLUEPRINT_CONTRACT,'AUTHORING_SEMANTIC','Semantic repair has no pinned compact blueprint to update');
        authoringPlan=applySemanticRepair(previousPlan,payload);validateData(authoringPlan,SEMANTIC_BLUEPRINT_SCHEMA);semantic=authoringPlan;repairs.push({kind:'host_semantic_delta_applied'});
      } else if(payload.contract===SEMANTIC_BLUEPRINT_CONTRACT){validateData(payload,SEMANTIC_BLUEPRINT_SCHEMA);authoringPlan=structuredClone(payload);}
      const normalized=normalizeSemanticBlueprint(semantic);validateData(normalized,INTERNAL_SEMANTIC_BLUEPRINT_SCHEMA);
      repairs.push({kind:'host_semantic_blueprint_lowered'});
      if(payload.contract===LEGACY_SEMANTIC_BLUEPRINT_CONTRACT)repairs.push({kind:'host_semantic_blueprint_v2_upgraded'});
      return {proposal:lowerSemanticBlueprint(pack,resources,normalized,{...context,routing_rules:provenance.routing_rules,routing_catalog:provenance.routing_catalog}),repairs,authoringPlan};
    })()
    : decodeGeneratedProposalDetailed(output,provenance.source_revision,{requirePlanningAnalysis:provenance.routing_rules?.selection_mode === 'automatic',requireSourceDispositions:(provenance.review_contract_version ?? 1)>=8,sourceInventory:sourceSectionInventory(resources)});
  const decoded=decodedResult.proposal;
  const proposal=projectObservedRequirements(decoded,resources);
  const repairs=[...decodedResult.repairs];
  if (canonicalJSON(decoded)!==canonicalJSON(proposal)) repairs.push({kind:'host_contract_projection',fields:['source_requirements','requirement_mappings','required_executables','input_bindings','resource_refs','requirement_ids']});
  const compiled=compileExpansion(pack,resources,proposal,{...context,routing_rules:provenance.routing_rules,routing_catalog:provenance.routing_catalog});
  if (canonicalJSON(proposal)!==canonicalJSON(compiled.canonical_proposal)) repairs.push({kind:'host_semantic_status_projection',fields:['requirement_mappings','tool_output_schemas']});
  const canonicalProposal=compiled.canonical_proposal;
  const findings=deterministicProposalFindings(canonicalProposal,compiled,provenance.review_contract_version ?? 1,resources);
  requireValue(findings.length===0,'GENERATION_DETERMINISTIC_AUDIT','The proposal does not satisfy the pinned deterministic conversion contract',{findings,validation:compiled.validation});
  return {decoded,proposal:canonicalProposal,compiled,repairs,authoring_plan:decodedResult.authoringPlan ?? null};
}
