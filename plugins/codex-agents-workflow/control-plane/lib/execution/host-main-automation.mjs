import { validateData, validateDataSchema } from '../workflow-data-schema.mjs';
import { requireValue } from '../workflow-paths.mjs';

export const HOST_AUTOMATION_CONTRACT = Object.freeze({
  version: 1,
  lifecycle: 'host_managed',
  agent_submission: 'semantic_values_only',
  finite_choices: 'host_form',
});

export function validateHostAutomationContract(contract) {
  requireValue(contract && typeof contract === 'object' && !Array.isArray(contract), 'HOST_AUTOMATION_CONTRACT', 'Workflow requires a host automation contract');
  requireValue(contract.version === HOST_AUTOMATION_CONTRACT.version, 'HOST_AUTOMATION_CONTRACT', 'Unsupported host automation contract version');
  for (const key of ['lifecycle', 'agent_submission', 'finite_choices']) {
    requireValue(contract[key] === HOST_AUTOMATION_CONTRACT[key], 'HOST_AUTOMATION_CONTRACT', `Invalid host automation setting: ${key}`);
  }
  return contract;
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * App Server structured output accepts only closed object schemas and requires
 * every declared property. Keep this check separate from the broader Workflow
 * data-schema validator: tool and input schemas may legitimately use dynamic
 * maps, but model-authored output may not be silently narrowed or discarded.
 */
export function strictAgentOutputSchema(schema, path = '$') {
  validateDataSchema(schema);
  if (path === '$' && Object.keys(schema).length === 0) {
    return { type: 'object', properties: {}, required: [], additionalProperties: false };
  }
  const strict = structuredClone(schema);
  const objectSchema = strict.type === 'object' || object(strict.properties) || Object.hasOwn(strict, 'additionalProperties');
  if (objectSchema) {
    requireValue(strict.type === 'object', 'AGENT_OUTPUT_SCHEMA', `${path}: model output objects require type=object`);
    requireValue(strict.additionalProperties === false, 'AGENT_OUTPUT_SCHEMA', `${path}: model output objects require additionalProperties=false; use declared fields or host-owned evidence instead of an open map`);
    strict.properties ??= {};
    strict.required ??= [];
    requireValue(Array.isArray(strict.required), 'AGENT_OUTPUT_SCHEMA', `${path}: required must be an array`);
    const propertyNames = Object.keys(strict.properties);
    requireValue(propertyNames.every(key => strict.required.includes(key)) && strict.required.every(key => Object.hasOwn(strict.properties, key)), 'AGENT_OUTPUT_SCHEMA', `${path}: strict model output requires every declared property, and only declared properties, in required`);
    for (const [key, child] of Object.entries(strict.properties)) strict.properties[key] = strictAgentOutputSchema(child, `${path}/properties/${key}`);
  }
  if (strict.type === 'array' && strict.items) strict.items = strictAgentOutputSchema(strict.items, `${path}/items`);
  return strict;
}

export function semanticResultSchema(definition, { finalAcceptance = false } = {}) {
  const schema = structuredClone(definition.outputs_schema ?? {});
  const hostManaged = [];
  if (definition.decision) {
    schema.properties ??= {};
    delete schema.properties.decision_id;
    delete schema.properties.references;
    schema.properties.decision = { ...(schema.properties.decision ?? {}), enum: [...definition.decision.options] };
    hostManaged.push('decision_id', 'references');
  }
  if (finalAcceptance) {
    schema.properties ??= {};
    delete schema.properties.accepted;
    hostManaged.push('accepted');
  }
  if (Array.isArray(schema.required)) schema.required = schema.required.filter(key => !hostManaged.includes(key));
  return schema;
}

export function managedNativeResultSchema(definition) {
  return strictAgentOutputSchema(semanticResultSchema(definition));
}

export function createMainHostBinding({ runId, controlToken, owner, definition, lease, finalAcceptance }) {
  return {
    protocol: 'host-main-v1',
    run_id: runId,
    control_token: controlToken,
    node_id: definition.id,
    attempt_id: lease.attempt_id,
    lease_token: lease.lease_token,
    owner,
    decision: definition.decision ? {
      id: definition.decision.id,
      required_references: [...(definition.decision.required_references ?? [])],
      blocked_option: definition.decision.options.includes('blocked') ? 'blocked' : null,
    } : null,
    final_acceptance: finalAcceptance === true,
  };
}

export function createMainAgentPacket({ definition, dispatched, resources, finalAcceptance }) {
  const schema = semanticResultSchema(definition, { finalAcceptance });
  return {
    role: definition.role ?? null,
    access: dispatched.envelope.access,
    workspace: dispatched.envelope.workspace,
    allowed_paths: dispatched.envelope.effective_allowed_paths,
    prompt: dispatched.compiled_prompt,
    resources: structuredClone(resources),
    response_form: {
      mode: 'semantic_values_only',
      schema,
      decision: definition.decision ? { kind: 'choice', options: [...definition.decision.options] } : null,
      acceptance: finalAcceptance ? { kind: 'boolean_choice', options: [true, false] } : null,
    },
  };
}

export function hostCompletionArgs(binding, semanticOutput, {
  accepted,
  summary,
  artifacts = [],
  evidence,
  changed_paths = [],
  outside_paths = [],
  request_prefix,
} = {}) {
  requireValue(binding?.protocol === 'host-main-v1', 'MAIN_HOST_BINDING', 'Host completion requires the exact host-owned main binding');
  requireValue(semanticOutput && typeof semanticOutput === 'object' && !Array.isArray(semanticOutput), 'MAIN_OUTPUT_REQUIRED', 'Main semantic output must be an object');
  if (binding.final_acceptance) requireValue(typeof accepted === 'boolean', 'FINAL_ACCEPTANCE_REQUIRED', 'The host acceptance form requires a boolean choice');
  return {
    run_id: binding.run_id,
    control_token: binding.control_token,
    node_id: binding.node_id,
    attempt_id: binding.attempt_id,
    lease_token: binding.lease_token,
    owner: binding.owner,
    output: structuredClone(semanticOutput),
    ...(typeof accepted === 'boolean' ? { accepted } : {}),
    ...(typeof summary === 'string' && summary.length ? { summary } : {}),
    artifacts: structuredClone(artifacts),
    evidence: structuredClone(evidence ?? [{ kind: 'host_semantic_submission', node_id: binding.node_id }]),
    changed_paths: structuredClone(changed_paths),
    outside_paths: structuredClone(outside_paths),
    ...(request_prefix ? { request_prefix } : {}),
  };
}

export function hostCompletionEnvelope(definition, args, finalAcceptance) {
  const schema = semanticResultSchema(definition, { finalAcceptance });
  validateData(args.output, schema);
  const structured_output = structuredClone(args.output);
  if (definition.decision) {
    structured_output.decision_id = definition.decision.id;
    structured_output.references = [...(definition.decision.required_references ?? [])];
  }
  if (finalAcceptance) {
    requireValue(typeof args.accepted === 'boolean', 'FINAL_ACCEPTANCE_REQUIRED', 'The host acceptance form requires a boolean choice');
    if (definition.outputs_schema?.properties?.accepted) structured_output.accepted = args.accepted;
  }
  return {
    status: 'succeeded',
    summary: typeof args.summary === 'string' && args.summary.length ? args.summary : `Main node ${definition.id} completed`,
    structured_output,
    artifacts: structuredClone(args.artifacts ?? args.changed_paths ?? []),
    evidence: structuredClone(args.evidence ?? [{ kind: 'host_semantic_submission', node_id: definition.id }]),
    changed_paths: structuredClone(args.changed_paths ?? []),
    outside_paths: structuredClone(args.outside_paths ?? []),
    ...(finalAcceptance ? { acceptance: { accepted: args.accepted } } : {}),
  };
}
