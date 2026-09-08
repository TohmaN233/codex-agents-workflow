// One acceptance contract shared by planning and review through analysis/request.txt.
export const CONVERSION_CONTRACT = {
  version: 1,
  checks: [
    'Preserve all meaningful source phases and their dependency order: discovery, production, evaluation, feedback and delivery. Do not approve a plan before the source-required evidence gathering.',
    'Preserve hard rules either explicitly or through actionable instructions to read and apply exact pinned references. Reference inheritance is valid coverage; do not duplicate every implementation detail in every prompt.',
    'Connect each consumed result to an actual preceding producer or explicit future Run input. Do not invent input fields, gate responses, output values or completed artifacts.',
    'Keep human confirmation before the dependent work it authorizes. Approval never enables missing tools or grants extra permissions. Do not place a confirmation gate in front of a known capability diagnostic.',
    'Keep optional features, installation, credentials and network conditional on the source trigger. Preserve valid cache-reuse conditions; do not turn conditional dependencies into universal blockers.',
    'Separate the intended workflow from present execution capability. Preserve intended phases in the editable Draft and state unmet capabilities explicitly in their instructions. Do not replace the workflow with a blocker-report-only graph, and never simulate unavailable execution or claim Ready.',
    'Every inferred node and edge must have an actual supporting source span. Broaden the span when multiple source rules justify the item; confidence is not proof.',
    'Review conversion correctness, not implementation quality of the imported software. Report all material violations in one pass with affected node, source evidence and minimal required correction. Styling preferences are not blockers.',
  ],
  reading: 'Read the numbered SKILL.md in this packet once. Resolve only references needed for concrete claims. Use read_workflow_resource_range on large files; each response declares its range and total lines. Never treat a partial read as a full-file audit. Avoid rereading unchanged text.',
  output: 'Emit the smallest complete graph matching the compiler contract. Preserve source procedures by reference rather than verbose paraphrases. One bounded self-check against every check above before submission; unresolved real issues remain explicit.',
};
