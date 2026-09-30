import { validateData } from '../workflow-data-schema.mjs';
import { WORKSPACE_SOURCE_LOCATIONS, validateWorkspaceSourceLocations } from '../workspace-source-locations.mjs';

// The completion transaction performs the same checks again against the then-current
// workspace. This early check only gives a live node a chance to correct its output.
export async function preflightSemanticOutput(definition, output, workspace) {
  validateData(output, definition.outputs_schema);
  for (const [output_name, kind] of Object.entries(definition.output_validators ?? {})) {
    if (kind === WORKSPACE_SOURCE_LOCATIONS) await validateWorkspaceSourceLocations(output[output_name], workspace,
      { producer_node_id: definition.id, output_name });
  }
}

export function correctableCompletionError(error) {
  return ['DATA_INVALID', 'SOURCE_LOCATION_INVALID', 'HOST_MAIN_OUTPUT_JSON'].includes(error?.code);
}

export function boundedCompletionDiagnostic(error) {
  const code = String(error?.code ?? 'COMPLETION_INVALID').slice(0, 80);
  const reason = typeof error?.reason === 'string' ? error.reason.slice(0, 120) : '';
  const index = Number.isSafeInteger(error?.index) ? error.index : null;
  const path = typeof error?.path === 'string' ? error.path.slice(0, 512) : '';
  const message = String(error?.message ?? 'Invalid completion').slice(0, 900);
  const range = Object.fromEntries(['start_line', 'end_line', 'actual_line_count']
    .filter(key => Number.isSafeInteger(error?.[key])).map(key => [key, error[key]]));
  return { code, ...(reason ? { reason } : {}), ...(index !== null ? { index } : {}), ...(path ? { path } : {}), ...range, message };
}
