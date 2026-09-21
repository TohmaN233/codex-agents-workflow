import { resolveBindings } from './workflow-bindings.mjs';
import { requireValue } from './workflow-paths.mjs';

function compatibilityProjection(node, state, workflow, provenance) {
  const legacyPack = workflow.context_projection_version === undefined || workflow.context_projection_version < 2;
  const legacyImport = legacyPack && provenance?.kind === 'skill_import' && (provenance.compiler_version ?? 1) < 2;
  const legacyMigration = legacyPack && provenance?.kind === 'v6-migration';
  const projection = node.context_projection ?? (legacyPack || legacyImport || legacyMigration
    ? { legacy_workflow_inputs: true, legacy_ancestor_results: true, compatibility_reason: 'Versioned pre-declared-binding Workflow compatibility preserves the immutable Run semantics.' }
    : undefined);
  if (projection === undefined) return null;
  requireValue(projection && typeof projection === 'object' && !Array.isArray(projection), 'CONTEXT_PROJECTION', 'Context projection must be an object');
  requireValue((projection.legacy_ancestor_results === true || projection.legacy_workflow_inputs === true) && typeof projection.compatibility_reason === 'string' && projection.compatibility_reason.trim().length > 0 && projection.compatibility_reason.length <= 512,
    'CONTEXT_PROJECTION', 'Legacy context needs an explicit bounded compatibility reason');
  const ancestors = new Set(); const queue = [node.id];
  while (queue.length) {
    const target = queue.pop();
    for (const edge of workflow.edges.filter(edge => edge.target === target)) if (!ancestors.has(edge.source)) { ancestors.add(edge.source); queue.push(edge.source); }
  }
  return {
    reason: projection.compatibility_reason,
    ...(projection.legacy_workflow_inputs ? { workflow_inputs: structuredClone(state.inputs) } : {}),
    ...(projection.legacy_ancestor_results ? { upstream_results: Object.fromEntries([...ancestors].sort().filter(id => ['succeeded', 'failed'].includes(state.nodes[id].status)).map(id => [id, {
      status: state.nodes[id].status, output: structuredClone(state.nodes[id].output), error: structuredClone(state.nodes[id].error),
    }])) } : {}),
  };
}

/** Only declared bindings and logical immutable references reach an executor. */
export function projectNodeContext(node, state, pins, bindingContext) {
  // Runtime decision identity, required-reference receipts and final acceptance
  // are journal/controller data.  They may remain in durable node output for
  // auditing, but must never flow back into a later semantic executor merely
  // because that executor binds an upstream output object.
  const semanticContext = structuredClone(bindingContext);
  for (const definition of pins.root.workflow.nodes ?? []) {
    const output = semanticContext.nodes?.[definition.id]?.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) continue;
    if (definition.decision) { delete output.decision_id; delete output.references; }
    if (pins.root.workflow.finalization?.node_id === definition.id) delete output.accepted;
  }
  const inputs = resolveBindings(node.input_bindings ?? {}, semanticContext);
  const resources = structuredClone(node.resources ?? []);
  const legacy = compatibilityProjection(node, state, pins.root.workflow, pins.root.provenance);
  return {
    inputs,
    references: resources,
    projection: {
      mode: 'declared_bindings',
      bindings: Object.keys(node.input_bindings ?? {}).sort(),
      references: resources,
      ...(legacy ? { legacy_ancestor_results: legacy } : {}),
    },
  };
}
