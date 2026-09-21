import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { WorkflowStore } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-store.mjs';
import { createDraft } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-schema.mjs';
import { createWorkflowPreset } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-presets.mjs';
import { loadRoutingSettings } from '../../plugins/codex-agents-workflow/control-plane/lib/skill-import/routing-settings.mjs';
import { validateWorkflowGraph } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-validator.mjs';

const configPath = resolve(process.argv[2] ?? '');
const dryRun = process.argv.includes('--dry-run');
const onlyImports = process.argv.includes('--only-imports');
if (!isAbsolute(configPath)) throw new Error('Pass an absolute control-plane config path');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const storeRoot = resolve(dirname(configPath), config.workflow_store.relative_path);
const context = { providers: config.providers };
const store = await new WorkflowStore(storeRoot, { validationContext: context }).initialize();
const routingRules = await loadRoutingSettings(dirname(configPath), config.providers);
const legacyIds = new Set(['bounded-code-change', 'brainstorm', 'cross-review', 'hard-path-web-advice', 'judgment-heavy-change', 'translation-bounded-write']);
const importedIds = new Set(['import-0a7cc876', 'zenonzard-card-update']);
const targets = onlyImports ? [...importedIds] : [...legacyIds, 'builtin-mathematical-research-hybrid', ...importedIds];

function modernizeLegacy(workflow) {
  const next = structuredClone(workflow);
  next.status = 'draft';
  next.context_projection_version = 2;
  next.host_automation = structuredClone(createDraft(next.id, next.name).host_automation);
  next.requirements.providers = [...new Set(next.nodes.flatMap(node => ['provider', 'thread'].includes(node.executor?.kind) ? [node.executor.provider_id] : []))].sort();
  if (next.import_status) {
    next.import_status.mode = 'coarse';
    delete next.import_status.conversion_level;
    delete next.import_status.conversion_contract_version;
    delete next.import_status.requirement_coverage;
  }
  const incoming = new Map(next.nodes.map(node => [node.id, []]));
  for (const edge of next.edges) incoming.get(edge.target)?.push(edge.source);
  const executed = new Set(['agent', 'skill_ref', 'tool', 'human_gate', 'subworkflow']);
  for (const node of next.nodes) {
    delete node.context_projection;
    if (!executed.has(node.type)) continue;
    const bindings = {
      task: { path: '/inputs/task', default: '' },
      context: { path: '/inputs/context', default: '' },
      verification: { path: '/inputs/verification', default: '' },
      ...(node.input_bindings ?? {}),
    };
    const predecessor = (incoming.get(node.id) ?? []).map(id => next.nodes.find(candidate => candidate.id === id)).find(candidate => executed.has(candidate?.type));
    if (predecessor && !Object.values(bindings).some(binding => typeof binding === 'string' && binding === `/nodes/${predecessor.id}/output`)) {
      bindings[node.role === 'finalizer' ? 'result' : 'previous_result'] = `/nodes/${predecessor.id}/output`;
    }
    node.input_bindings = bindings;
  }
  return next;
}

const results = [];
for (const id of targets) {
  const pack = await store.snapshot(id);
  const workflow = id === 'builtin-mathematical-research-hybrid'
    ? { ...createWorkflowPreset('mathematical-research-hybrid', config.providers, routingRules), status: 'draft', revision: pack.workflow.revision }
    : modernizeLegacy(pack.workflow);
  const validation = validateWorkflowGraph(workflow, context);
  if (!validation.valid) throw Object.assign(new Error(`Modernized ${id} is invalid`), { validation });
  const saved = dryRun ? null : await store.save(id, workflow, {
      expected_revision: pack.revision_hash,
      resources: await store.resources(id, pack.revision_hash),
      provenance: { ...pack.provenance, modernization: { from_revision: pack.revision_hash, context_projection_version: 2, actor: 'deterministic-host', at: new Date().toISOString() } },
      import_report: pack.import_report,
    });
  results.push({ id, from_revision: pack.revision_hash, ...(saved ? { draft_revision: saved.revision_hash } : {}), valid: true });
}
process.stdout.write(JSON.stringify({ dry_run: dryRun, store_root: storeRoot, results }, null, 2) + '\n');
