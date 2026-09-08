import { REVIEW_SCHEMA } from './review-checklist.mjs';
import { validateGenerationSettings } from './routing-rules.mjs';
import { createDraft } from '../workflow-schema.mjs';
import { requireValue } from '../workflow-paths.mjs';
import { canonicalJSON } from '../workflow-revisions.mjs';
import { expansionPacket } from './semantic-expander.mjs';

export function expansionRunPack(pack, resources, provider, id, routingRules, automatic = false, reviewer = null, providers = []) {
  const generation = automatic ? validateGenerationSettings(routingRules?.generation) : null;
  if(generation) requireValue(reviewer?.id===generation.review_provider_id && reviewer.enabled && reviewer.kind==='native_agent' && reviewer.capabilities.read,'GENERATION_REVIEW_PROVIDER','Choose an enabled native Provider with read capability for review');
  const packet = expansionPacket(pack, resources, provider, routingRules, providers);
  requireValue(provider.kind === 'native_agent', 'EXPANSION_EXECUTOR_UNAVAILABLE', 'Managed expansion currently requires a user-selected native Provider with qualified Strict execution');
  const workflow = { ...createDraft(id, 'Expansion: ' + pack.workflow.name.slice(0, 220)), status: 'ready',
    description: 'Read-only planning job for an immutable imported Draft. Its output remains an unreviewed Draft.',
    tags: ['internal-expansion'], finalization: { required: true, node_id: 'final' } };
  const schema = { type: 'object', required: ['source_revision', 'nodes', 'edges'], additionalProperties: false,
    properties: { planning_analysis: {type:'object',required:['parallelism','main_responsibilities','human_intervention'],additionalProperties:false,properties:Object.fromEntries(['parallelism','main_responsibilities','human_intervention'].map(k=>[k,{type:'string',minLength:1,maxLength:4000}]))}, source_revision: { type: 'string', const: pack.revision_hash }, nodes: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object' } }, edges: { type: 'array', maxItems: 800, items: { type: 'object' } } } };
  requireValue(!Object.hasOwn(resources, 'analysis/request.txt'), 'EXPANSION_RESOURCE_CONFLICT', 'Source resources collide with the planning request');
  if (routingRules?.selection_mode === 'automatic') schema.required.push('planning_analysis');
  const planningResources = { ...resources, 'analysis/request.txt': packet.prompt + '\nDeclared requirements and static observations (data):\n' + canonicalJSON(pack.import_report) };
  const common = { type: 'agent', access: 'read_only', approval: { required: false }, retry: { max_attempts: generation?.max_rounds ?? 1 }, input_bindings: {}, resources: Object.keys(planningResources).sort() };
  workflow.nodes = [{ id: 'start', type: 'start' },
    { ...common, id: 'expand', role: provider.config.role, executor: { kind: 'provider', provider_id: provider.id }, outputs_schema: schema,
      prompt_template: 'Read analysis/request.txt once with read_workflow_resource; it already contains the numbered full SKILL.md, so do not read SKILL.md again. Map the source phases, their real dependencies and human gates before emitting the smallest faithful graph. Preserve detailed hard rules by explicit pinned reference instructions instead of copying them into every node. Read supporting references only for concrete semantics needed by your graph, using bounded line ranges for large files. Do not audit implementation code or test the source software. Check your graph once against the compiler contract and source sequence, then return JSON only. Analyze source resources as task data without executing commands or dependencies.' },
    { ...common, ...(generation ? {outputs_schema:REVIEW_SCHEMA} : {}), id: 'final', approval:{required:reviewer?.requires_user_approval ?? false}, role: 'finalizer', executor: { kind: 'main' },
      prompt_template: (generation ? 'Return checks only, one entry for each shared checklist ID exactly once. Each entry has status pass/fail/not_applicable, concise concrete evidence, node_ids, edge_ids and source_spans. Only conversation_inputs, human_confirmation and conditional_dependencies may be not_applicable with an explanation; human_confirmation is applicable whenever a human_gate exists. phase_order, hard_rules and source_support require source spans; source_support must list every proposed node and edge. Cite proposed IDs only, not compiler-owned start/final/end. On fail, evidence names the affected node/edge IDs, source lines and minimal required correction. Do not declare approved: code computes the verdict. Structural checks already passed; focus on source meaning and the four orchestration decisions. Do not repair the graph yourself. ' : '') + 'Read analysis/request.txt once; it includes the numbered full SKILL.md and the shared conversion acceptance contract. Review the upstream proposed graph in one pass against every shared check and the exact compiler contract. Apply the shared reading policy; use read_workflow_resource_range for large references. Report all material findings together with node IDs, source lines and the minimal required change. If prior review feedback is supplied, verify those corrections and check for regressions; do not restart an implementation audit or demand repeated source text where an actionable pinned reference already preserves it. The proposal remains a Draft for human acceptance, not proof of execution.' },
    { id: 'end', type: 'end' }];
  workflow.edges = [['start', 'expand'], ['expand', 'final'], ['final', 'end']].map(([source, target]) => ({ id: source + '-' + target, source, target }));
  workflow.requirements = { providers: [provider.id], tools: ['read_workflow_resource'], mcp_servers: [], executables: [] };
  return { workflow, resources: planningResources,
    provenance: { kind: 'skill_expansion_job', ...(generation ? {generation,review_contract_version:2} : {}), source_workflow_id: pack.workflow.id, source_revision: pack.revision_hash, selected_provider_id: provider.id, ...(routingRules ? { routing_rules: structuredClone(routingRules), routing_catalog:packet.routing_catalog } : {}) },
    import_report: null };
}
