import { graphInfo } from './workflow-state.mjs';
import { requireValue } from './workflow-paths.mjs';
import { createMainAgentPacket, createMainHostBinding } from './execution/host-main-automation.mjs';

const semantic = new Set(['agent', 'skill_ref']);
const terminal = new Set(['succeeded', 'failed', 'cancelled']);

/**
 * Advance Host/control/tool work plus explicitly configured managed-native
 * semantic nodes.  Other semantic executors stop for a separately journaled
 * handoff.  Every managed dispatch still uses the normal claim, intent,
 * receipt, usage and completion path; this helper grants no extra authority.
 */
export class WorkflowDrive {
  constructor({ runtime, executor, store }) { this.runtime = runtime; this.executor = executor; this.store = store; }

  async advance(runId, { control_token, owner = 'workflow-drive', request_prefix = 'drive' } = {}) {
    requireValue(typeof owner === 'string' && owner.length > 0 && owner.length <= 256, 'DRIVE_OWNER', 'Drive needs a bounded controller owner');
    await this.runtime.authorizeController(runId, { control_token });
    for (let step = 0; step < 1024; step++) {
      const record = await this.runtime.runs.read(runId); const state = record.state; const next = await this.runtime.next(runId);
      if (terminal.has(state.status)) return { status: state.status, stop_reason: 'terminal', steps: step };
      if (next.parent_block) return { status: state.status, stop_reason: 'parent_block', details: next.parent_block, steps: step };
      if (next.approvals.length) return { status: state.status, stop_reason: 'approval', approvals: next.approvals, steps: step };
      if (!next.ready.length) return { status: state.status, stop_reason: state.status === 'blocked' ? 'input_or_ambiguity' : 'no_deterministic_progress', steps: step };
      const graph = graphInfo(record.pins.root.workflow); const nodeId = graph.order.find(id => next.ready.includes(id)); const definition = graph.nodes.get(nodeId);
      if (semantic.has(definition.type)) {
        const maximum = definition.cost?.maximum_micros ?? definition.decision?.budget?.maximum_micros ?? null;
        const budget = state.cost_ledger?.budget;
        if (budget && (maximum === null || state.cost_ledger.spent_micros + state.cost_ledger.reserved_micros + maximum > budget.limit_micros)) return { status: state.status, stop_reason: 'budget', node_id: nodeId, steps: step };
        const provider = definition.executor?.kind === 'provider' ? record.pins.providers.find(item => item.id === definition.executor.provider_id) : null;
        if (provider?.kind === 'native_agent' && this.executor.managedNativeManager) {
          let lease;
          try { lease = await this.runtime.claimNode(runId, { node_id: nodeId, owner, request_id: `${request_prefix}-${nodeId}-${record.sequence}`, control_token }); }
          catch (error) {
            if (['BINDING_MISSING', 'APPROVAL_REQUIRED'].includes(error.code)) return { status: state.status, stop_reason: error.code === 'BINDING_MISSING' ? 'missing_input' : 'approval', node_id: nodeId, error: { code: error.code, message: error.message }, steps: step };
            throw error;
          }
          const launched = await this.executor.dispatch(runId, { ...lease, control_token, host_managed_native: true });
          if (launched.completed === true) continue;
          await this.executor.managedNativeManager.wait(runId, lease.attempt_id);
          continue;
        }
        return { status: state.status, stop_reason: 'semantic_node', node_id: nodeId, steps: step };
      }
      if (definition.type === 'human_gate') return { status: state.status, stop_reason: 'approval', node_id: nodeId, steps: step };
      if (definition.type === 'tool') {
        let lease;
        try { lease = await this.runtime.claimNode(runId, { node_id: nodeId, owner, request_id: `${request_prefix}-${nodeId}-${record.sequence}`, control_token }); }
        catch (error) {
          if (['BINDING_MISSING', 'APPROVAL_REQUIRED'].includes(error.code)) return { status: state.status, stop_reason: error.code === 'BINDING_MISSING' ? 'missing_input' : 'approval', node_id: nodeId, error: { code: error.code, message: error.message }, steps: step };
          throw error;
        }
        const outcome = await this.executor.executeHostTool(runId, { node_id: nodeId, attempt_id: lease.attempt_id, lease_token: lease.lease_token, control_token });
        if (outcome.status === 'failed') return { status: 'failed', stop_reason: 'host_failure', node_id: nodeId, error: outcome.nodes?.[nodeId]?.error ?? null, steps: step + 1 };
        if (outcome.status === 'cancelled') return { status: 'cancelled', stop_reason: 'terminal', steps: step + 1 };
        continue;
      }
      if (definition.type === 'subworkflow') return { status: state.status, stop_reason: 'child_control', node_id: nodeId, steps: step };
      return { status: state.status, stop_reason: 'ambiguity', node_id: nodeId, steps: step };
    }
    throw Object.assign(new Error('Deterministic drive exceeded its bounded transition limit'), { code: 'DRIVE_LIMIT' });
  }

  /**
   * Advance deterministic work, then atomically claim and dispatch the next
   * main-agent node.  The response deliberately omits the full Run state and
   * returns only the current node prompt, completion schema and its declared
   * resource texts.  This keeps node-scoped projection while avoiding the
   * repeated next -> claim -> dispatch -> read_resource model round trips.
   */
  async advanceToMain(runId, { control_token, owner, request_prefix = 'main' } = {}) {
    requireValue(this.store, 'MAIN_DRIVE_STORE', 'Main-session drive needs the Workflow resource store');
    requireValue(typeof owner === 'string' && owner.length > 0 && owner.length <= 256, 'DRIVE_OWNER', 'Main-session drive needs the exact main actor');
    const progress = await this.advance(runId, { control_token, owner, request_prefix });
    if (progress.stop_reason !== 'semantic_node') return { run_id: runId, control_token, ...progress };

    const record = await this.runtime.runs.read(runId);
    const definition = record.pins.root.workflow.nodes.find(node => node.id === progress.node_id);
    requireValue(definition, 'NODE_MISSING', 'Drive selected a node absent from the pinned Workflow');
    if (definition.executor?.kind !== 'main') return { run_id: runId, control_token, ...progress, stop_reason: 'non_main_semantic' };

    const requestId = `${request_prefix}-${definition.id}-${record.sequence}`;
    const lease = await this.runtime.claimNode(runId, { node_id: definition.id, owner, request_id: requestId, control_token });
    const dispatched = await this.executor.dispatch(runId, { ...lease, control_token });
    requireValue(dispatched.adapter?.execution === 'main_agent' && dispatched.handoff_required === true, 'MAIN_DRIVE_ADAPTER', 'Main-session drive may return only a main-agent handoff');

    const packResources = await this.store.resources(record.pins.root.workflow.id, record.pins.root.revision_hash);
    const resources = (definition.resources ?? []).map(path => {
      const bytes = packResources[path];
      requireValue(bytes, 'RESOURCE_MISSING', `Pinned main-node resource is unavailable: ${path}`);
      requireValue(Buffer.isBuffer(bytes) && bytes.length <= 65536, 'MAIN_RESOURCE_LIMIT', `Main-node resource is not bounded text: ${path}`);
      return { path, text: bytes.toString('utf8') };
    });
    requireValue(resources.reduce((total, item) => total + Buffer.byteLength(item.text), 0) <= 131072, 'MAIN_RESOURCE_LIMIT', 'Projected main-node resources exceed the compact handoff limit');

    const finalAcceptance = record.pins.root.workflow.finalization?.required === true && record.pins.root.workflow.finalization.node_id === definition.id;
    return {
      status: 'running',
      stop_reason: 'main_node',
      steps: progress.steps,
      host_binding: createMainHostBinding({ runId, controlToken: control_token, owner, definition, lease, finalAcceptance }),
      agent_packet: createMainAgentPacket({ definition, dispatched, resources, finalAcceptance }),
    };
  }
}
