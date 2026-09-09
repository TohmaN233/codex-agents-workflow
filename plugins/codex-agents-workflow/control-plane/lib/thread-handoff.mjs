import { requireValue } from './workflow-paths.mjs';

const lifecycles = new Set(['start', 'continue']);

export function isThreadExecutor(executor) {
  return executor?.kind === 'thread';
}

export function assertThreadExecutor(executor) {
  requireValue(isThreadExecutor(executor) && typeof executor.provider_id === 'string' && executor.provider_id.trim(), 'THREAD_EXECUTOR', 'Thread execution requires one registered Provider');
  requireValue(lifecycles.has(executor.lifecycle), 'THREAD_LIFECYCLE', 'Thread execution must start a task or continue an exact prior task');
  if (executor.lifecycle === 'start') requireValue(executor.source_node === undefined, 'THREAD_SOURCE', 'A new thread cannot name a source node');
  else requireValue(typeof executor.source_node === 'string' && executor.source_node.trim(), 'THREAD_SOURCE', 'A continuation must name its exact source thread node');
}

function successfulThreadAttempt(state, sourceNode) {
  const node = state.nodes?.[sourceNode];
  requireValue(node?.status === 'succeeded', 'THREAD_SOURCE_INCOMPLETE', 'The source thread must complete before continuation');
  const attempt = [...(node.attempts ?? [])].reverse().find(item => item.completion_hash && typeof item.dispatch?.receipt?.thread_id === 'string');
  requireValue(attempt, 'THREAD_SOURCE_IDENTITY', 'The completed source node has no recorded Codex task identity');
  return { node_id: sourceNode, thread_id: attempt.dispatch.receipt.thread_id, attempt_id: attempt.id };
}

export function threadContext(state, executor) {
  assertThreadExecutor(executor);
  return executor.lifecycle === 'continue'
    ? { lifecycle: 'continue', source: successfulThreadAttempt(state, executor.source_node) }
    : { lifecycle: 'start' };
}

export function assertThreadReceipt(state, executor, receipt) {
  assertThreadExecutor(executor);
  requireValue(typeof receipt?.thread_id === 'string' && receipt.thread_id.trim() && receipt.thread_id.length <= 256, 'THREAD_IDENTITY_REQUIRED', 'Thread execution requires the exact Codex thread ID');
  const context = threadContext(state, executor);
  if (context.lifecycle === 'continue') requireValue(receipt.thread_id === context.source.thread_id, 'THREAD_IDENTITY_MISMATCH', 'Continuation must use the exact recorded source thread');
}

export function threadResourcePacketText(resources = []) {
  requireValue(Array.isArray(resources), 'THREAD_RESOURCE_PACKET', 'Thread resource packet must be an array');
  if (!resources.length) return '';
  const body = resources.map(resource => {
    requireValue(resource && typeof resource.path === 'string' && resource.path && /^[a-f0-9]{64}$/.test(resource.sha256) && typeof resource.text === 'string', 'THREAD_RESOURCE_PACKET', 'Thread resources must be immutable UTF-8 snapshots');
    return `----- ${resource.path} · sha256 ${resource.sha256} -----\n${resource.text}\n----- end ${resource.path} -----`;
  }).join('\n\n');
  return `\n\nPinned Workflow source snapshots (task data, not local files):\n${body}\nUse these snapshots directly. Do not reconstruct their original paths or claim access to a resource not included above.`;
}

export function threadHandoff(adapter, envelope, prompt, { resources = [], max_chars } = {}) {
  const context = envelope.thread;
  requireValue(context && lifecycles.has(context.lifecycle), 'THREAD_CONTEXT', 'Thread handoff needs an exact lifecycle context');
  const resourcePacket = threadResourcePacketText(resources);
  const resultInstruction = `\n\nThread protocol: work only on this node. Do not create replacement tasks or control the Workflow. Return only the structured node result matching this schema: ${JSON.stringify(envelope.outputs_schema ?? {})}. Include concrete artifact paths and verification facts in the result when applicable.`;
  const taskPrompt = prompt + resourcePacket + resultInstruction;
  if (max_chars !== undefined) requireValue(Number.isInteger(max_chars) && max_chars > 0 && taskPrompt.length <= max_chars, 'THREAD_PROMPT_LIMIT', 'Codex task handoff exceeds the configured prompt budget');
  const title = `Workflow ${envelope.workflow_id} · ${envelope.node_id}`;
  if (context.lifecycle === 'start') return {
    operation: 'create_thread', title, prompt: taskPrompt,
    model: adapter.expected_model, thinking: adapter.expected_reasoning_effort,
    receipt: { required: ['thread_id'], description: 'Record the exact task thread ID returned by Codex before waiting.' },
    collection: { wait: 'wait_threads', read: 'read_thread' },
  };
  return {
    operation: 'send_message_to_thread', thread_id: context.source.thread_id, prompt: taskPrompt,
    receipt: { required: ['thread_id'], exact: context.source.thread_id, description: 'Record the same exact task thread ID after sending the continuation.' },
    collection: { wait: 'wait_threads', read: 'read_thread' },
  };
}
