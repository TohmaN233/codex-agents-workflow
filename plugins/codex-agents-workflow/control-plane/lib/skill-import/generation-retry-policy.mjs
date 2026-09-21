const SEMANTIC_CODES=new Set([
  'GENERATION_REVIEW_FINDINGS',
  'GENERATION_DETERMINISTIC_AUDIT',
  'AUTHORING_SEMANTIC',
  'EXPANSION_SOURCE_DISPOSITIONS',
  'EXPANSION_REQUIREMENT_COVERAGE',
  'EXPANSION_TOOL_BINDINGS',
  'EXPANSION_OPERATION_MODE',
  'EXPANSION_REVIEW_WRITE',
]);
export const MAX_PLANNER_ATTEMPTS=2;

// These failures concern fields or capabilities owned by the Host. They must
// stop visibly, never be converted into planner feedback, and never spend the
// one semantic repair even if their code shares the EXPANSION_ namespace.
const MECHANICAL_CODES=new Set([
  'DATA_INVALID',
  'GENERATION_PROPOSAL_ENVELOPE',
  'GENERATION_PROPOSAL_JSON',
  'GENERATION_PROPOSAL_CONTRACT',
  'EXPANSION_GRAPH_INVALID',
  'ROUTING_CLASSIFICATION',
  'EXPANSION_WRITE_PROVIDER',
  'EXPANSION_THREAD_LIFECYCLE',
]);

export function isGenerationContractFailure(errorOrFeedback){
  const code=errorOrFeedback?.code ?? '';
  return SEMANTIC_CODES.has(code) || MECHANICAL_CODES.has(code) || code.startsWith('EXPANSION_');
}

export function generationRetryClass(errorOrFeedback){
  const code=errorOrFeedback?.code ?? 'GENERATION_UNKNOWN';
  return SEMANTIC_CODES.has(code)?'semantic':'mechanical';
}

export function semanticGenerationRepair(errorOrFeedback){
  return generationRetryClass(errorOrFeedback)==='semantic';
}
