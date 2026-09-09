// One acceptance contract shared by planning and review through analysis/request.txt.
export const CONVERSION_CONTRACT = {
  version: 2,
  checks: [
    'Analyze independent work versus data/order/shared-state dependencies. Use parallel/join for useful disjoint tasks and justify sequential decisions.',
    'Decide main versus subagent for each responsibility. Main owns synthesis and user-facing decisions; delegate bounded independently verifiable work. In fixed mode use configured routes and omit automatic execution selection fields.',
    'Identify required human intervention and missing task answers before generating the graph; preserve decision timing and distinguish approval gates from input collection.',
    'In automatic mode choose each subagent from the pinned registered catalog using suitability descriptions and actual capabilities with a task-specific reason. In fixed mode follow configured task routes. Never infer model quality from names.',

    'Preserve all meaningful source phases and their dependency order: discovery, production, evaluation, feedback and delivery. Do not approve a plan before the source-required evidence gathering.',
    'Preserve hard rules either explicitly or through actionable instructions to read and apply exact pinned references. Reference inheritance is valid coverage; do not duplicate every implementation detail in every prompt.',
    'Connect each consumed result to an actual preceding producer or explicit future Run input. Do not invent input fields, gate responses, output values or completed artifacts.',
    'Success means the result needed downstream was actually produced. When inputs, capabilities or verification are missing, the node must stop, not return a successful blocker report. In Strict execution a node returns exactly {"$workflow_blocked":"specific reason or missing input"} to fail visibly and prevent downstream success edges; this is the sole exception to its success output schema. Cooperative host execution reports failure through workflow_fail_node; do not hardcode Strict-only failure instructions in a Cooperative graph.',
    'Agent nodes cannot pause for a conversation and human gates are not forms. Required briefing answers and startup continuation decisions must be supplied explicitly in the future Run task after source-required evidence gathering. If answers are missing, report the concrete questions via the blocking result; a later Run supplies the answers. Preserve startup memory/continuation and feedback procedures by actionable pinned reference.',
    'Keep human confirmation before the dependent work it authorizes. Approval never enables missing tools or grants extra permissions. Gate source-required user decisions, not static checks of the current host environment.',
    'Keep optional features, installation, credentials and network conditional on the source trigger. Declare unconditional executable names with source evidence in required_executables for the automatic Run preparation gate. Keep optional tools out of that unconditional list and check them before their triggered step. Preserve valid cache-reuse conditions; do not turn conditional dependencies into universal blockers.',
    'Separate the intended workflow from present execution capability. Preserve intended phases and portable resource references in the editable Draft. Declare source dependencies without embedding current host availability; environment preparation and failures belong to execution. Do not replace the workflow with a blocker-report-only graph, and never simulate unavailable execution or claim Ready.',
    'Every inferred node and edge must have an actual supporting source span. An edge citation covers the source-to-target transition, including the downstream phase; a confirmation citation must support that specific confirmation, not a different earlier gate. Broaden spans when multiple source rules justify the item; confidence is not proof. Finish a source-span pass over every edge and gate even when other blocking findings were already found.',
    'Review conversion correctness, not implementation quality of the imported software. Report all material violations in one pass with affected node, source evidence and minimal required correction. Styling preferences are not blockers.',
  ],
  reading: 'Read the numbered SKILL.md in this packet once. Resolve only references needed for concrete claims. Use read_workflow_resource_range on large files; each response declares its range and total lines. Never treat a partial read as a full-file audit. Avoid rereading unchanged text.',
  output: 'Emit the smallest complete graph matching the compiler contract. Preserve source procedures by reference rather than verbose paraphrases. One bounded self-check against every check above before submission; unresolved real issues remain explicit.',
};

// Stable identifiers are the shared generator/reviewer vocabulary.
const keys = ['parallelism','agent_ownership','human_intervention','model_selection','phase_order','hard_rules','data_handoffs','failure_semantics','conversation_inputs','human_confirmation','conditional_dependencies','portable_artifact','source_support','review_scope'];
CONVERSION_CONTRACT.checks = CONVERSION_CONTRACT.checks.map((requirement,index)=>({id:keys[index],requirement}));
