import { requireValue, workflowId } from './workflow-paths.mjs';
import { canonicalJSON, LIMITS } from './workflow-revisions.mjs';
import { HOST_AUTOMATION_CONTRACT, validateHostAutomationContract } from './execution/host-main-automation.mjs';

export const NODE_TYPES = new Set(['start', 'end', 'agent', 'condition', 'parallel', 'join', 'skill_ref', 'subworkflow', 'tool', 'human_gate']);
export const HUMAN_GATE_OUTPUT = Object.freeze({ approved: true });

export function validateWorkflowShape(workflow) {
  const encoded = canonicalJSON(workflow);
  requireValue(Buffer.byteLength(encoded) <= LIMITS.definition, 'WORKFLOW_SIZE', 'Workflow definition exceeds size limit');
  requireValue(workflow.schema_version === 1, 'WORKFLOW_SCHEMA', 'Unsupported Workflow schema version');
  workflowId(workflow.id);
  requireValue(typeof workflow.name === 'string' && workflow.name.trim().length > 0 && workflow.name.length <= 256, 'WORKFLOW_NAME', 'Workflow requires a name of at most 256 characters');
  requireValue(['draft', 'ready'].includes(workflow.status), 'WORKFLOW_STATUS', 'Workflow status must be draft or ready');
  requireValue(Array.isArray(workflow.nodes) && Array.isArray(workflow.edges) && workflow.nodes.length <= 512 && workflow.edges.length <= 2048, 'WORKFLOW_GRAPH', 'Workflow needs bounded node and edge arrays');
  requireValue(typeof workflow.enabled === 'boolean', 'WORKFLOW_ENABLED', 'Workflow enabled flag is required');
  if (workflow.host_automation !== undefined) validateHostAutomationContract(workflow.host_automation);
  return workflow;
}

export function createDraft(id, name) {
  return {
    schema_version: 1, context_projection_version: 2, id: workflowId(id), name, enabled: true, status: 'draft', revision: 1,
    description: '', tags: [], inputs_schema: {}, outputs_schema: {},
    skill_policy: { mode: 'strict', implicit: 'deny', ambient_allow: [], shadowed_skill_paths: [] },
    host_automation: structuredClone(HOST_AUTOMATION_CONTRACT),
    requirements: { providers: [], tools: [], mcp_servers: [], executables: [] },
    finalization: { required: true, node_id: '' }, nodes: [], edges: [],
  };
}
