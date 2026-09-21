import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { createManagedNativeSession } from './managed-native-session.mjs';
import { createHostAuthBroker } from './codex-host-auth.mjs';
import { createCodexToolBroker } from './codex-tool-broker.mjs';
import { qualifiedStrictSettings } from './strict-config.mjs';
import { managedNativeResultSchema, hostCompletionEnvelope } from './host-main-automation.mjs';
import { validateData } from '../workflow-data-schema.mjs';
import { canonicalJSON, digest } from '../workflow-revisions.mjs';
import { requireValue } from '../workflow-paths.mjs';
import { isEnvironmentDisabled } from '../config.mjs';

const managers = new Map();
const entryKey = (runId, attemptId) => `${runId}/${attemptId}`;
const codeOf = error => typeof error?.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(error.code) ? error.code : 'MANAGED_NATIVE_FAILED';
const diagnosticOf = error => {
  const messages = [];
  const visit = value => {
    if (!value || messages.length >= 8) return;
    messages.push(`${codeOf(value)}: ${String(value.message ?? value)}`);
    if (value instanceof AggregateError) for (const child of value.errors) visit(child);
    else if (value.cause) visit(value.cause);
  };
  visit(error);
  return messages.join(' | ')
    .replace(/\bBearer\s+\S+/ig, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|cookie|secret)\s*[:=]\s*)\S+/ig, '$1[redacted]')
    .slice(0, 2000);
};

async function snapshotWorkspace(root) {
  const result = new Map(); let files = 0; let bytes = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const absolute = join(directory, entry.name); const rel = relative(root, absolute).replaceAll('\\', '/');
      const stat = await lstat(absolute);
      requireValue(!stat.isSymbolicLink(), 'MANAGED_NATIVE_WORKSPACE_SYMLINK', `Managed workspace contains a symbolic link: ${rel}`);
      if (stat.isDirectory()) { await walk(absolute); continue; }
      if (!stat.isFile()) continue;
      files++; bytes += stat.size;
      requireValue(files <= 20000 && bytes <= 2 * 1024 * 1024 * 1024, 'MANAGED_NATIVE_WORKSPACE_LIMIT', 'Managed workspace exceeds the bounded audit snapshot');
      result.set(rel, digest(await readFile(absolute)));
    }
  }
  await walk(root); return result;
}

function changedPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter(path => before.get(path) !== after.get(path)).sort();
}
function within(path, boundary) { return boundary === '.' || path === boundary || path.startsWith(boundary.replaceAll('\\', '/').replace(/\/$/, '') + '/'); }
function augmentedEnvironment(env, runtimeEnvironment) {
  const directories = (runtimeEnvironment?.tools ?? []).filter(tool => tool.status === 'found' && typeof tool.path === 'string' && isAbsolute(tool.path)).map(tool => dirname(tool.path));
  const inherited = env.PATH ?? env.Path ?? '';
  return { ...env, PATH: [...new Set([...directories, ...inherited.split(delimiter).filter(Boolean)])].join(delimiter) };
}
async function resourceItems(runtime, runId, envelope) {
  if (!envelope.resources.length) return [];
  const record = await runtime.runs.read(runId); const root = join(runtime.runs.directory(runId), 'objects');
  const resources = [];
  for (const path of envelope.resources) {
    const pin = record.pins.root.resources.find(item => item.path === path);
    requireValue(pin && pin.bytes <= 1024 * 1024, 'MANAGED_NATIVE_RESOURCE', `Pinned resource is unavailable or too large: ${path}`);
    resources.push({ path, sha256: pin.sha256, bytes: await readFile(join(root, pin.sha256)) });
  }
  return resources;
}

export function managedNativeManagerFor(options) {
  const id = resolve(options.configPath);
  if (!managers.has(id)) managers.set(id, new ManagedNativeManager(options));
  return managers.get(id);
}
export async function closeManagedNativeManagers() {
  const settled = await Promise.allSettled([...managers.values()].map(manager => manager.close()));
  managers.clear();
  const failures = settled.filter(item => item.status === 'rejected').map(item => item.reason);
  if (failures.length) throw new AggregateError(failures, 'Managed native shutdown requires attention');
}

export class ManagedNativeManager {
  constructor({ configPath, getConfig, env = process.env, sessionFactory = createManagedNativeSession, qualify = qualifiedStrictSettings }) {
    this.configPath = resolve(configPath); this.getConfig = getConfig; this.env = env; this.sessionFactory = sessionFactory; this.qualify = qualify;
    this.parent = join(dirname(this.configPath), 'managed-native-profiles'); this.entries = new Map(); this.hostAuth = null; this.hostAuthBinary = null;
  }
  async prepare(_runtime, _runId, _args, envelope) {
    requireValue(envelope.skill_policy.mode === 'cooperative' && envelope.provider?.kind === 'native_agent', 'MANAGED_NATIVE_NODE', 'Managed native execution requires a cooperative native Provider node');
    requireValue(!envelope.skill_ref && envelope.allowed_skills.length === 0, 'MANAGED_NATIVE_SKILL_ISOLATION', 'Managed Workflow children cannot read source or ambient Skills');
    const settings = await this.qualify(await this.getConfig(), this.env);
    return { execution: 'managed_native_codex', model: envelope.provider.config.model, effort: envelope.provider.config.reasoning_effort,
      executable_sha256: settings.binary_sha256, settings, final_acceptance_required: false };
  }
  async launch(runtime, runId, args, prepared) {
    const id = entryKey(runId, args.attempt_id);
    requireValue(!this.entries.has(id), 'MANAGED_NATIVE_EXISTS', 'An exact managed child already owns this attempt');
    const entry = { runtime, runId, args: { ...args }, prepared, session: null, broker: null, authorize: null, status: 'preparing', stopping: false, error: null, job: null, writes: new Set() };
    this.entries.set(id, entry);
    const receipt = { invocation_id: `managed-${args.attempt_id}`, executor: 'codex-app-server-managed-native', model: prepared.adapter.model, effort: prepared.adapter.effort, executable_sha256: prepared.adapter.executable_sha256 };
    await runtime.recordDispatchReceipt(runId, { ...args, request_id: `dispatch-${args.attempt_id}`, receipt });
    entry.job = this.execute(entry).catch(error => this.fail(entry, error)); entry.done = entry.job;
    return { dispatched: true, receipt, completed: false, managed: true };
  }
  async wait(runId, attemptId) {
    const entry = this.entries.get(entryKey(runId, attemptId));
    requireValue(entry?.done, 'MANAGED_NATIVE_UNAVAILABLE', 'The exact managed child lifecycle is unavailable');
    return entry.done;
  }
  async execute(entry) {
    const { runtime, runId, args, prepared } = entry; const { envelope, adapter } = prepared;
    const record = await runtime.runs.read(runId);
    const definition = record.pins.root.workflow.nodes.find(node => node.id === args.node_id);
    requireValue(definition, 'NODE_MISSING', 'Managed native node is absent from the pinned Workflow');
    const before = await snapshotWorkspace(envelope.workspace);
    const event = (kind, metadata) => runtime.recordExecutorEvent(runId, { ...args, event: { kind, metadata } });
    entry.authorize = async () => {
      requireValue(!entry.stopping, 'MANAGED_NATIVE_STOPPED', 'Managed node permission was revoked');
      await runtime.execution(runId, args, { allowPaused: entry.status === 'running' });
      const config = await this.getConfig();
      requireValue(config.global.enabled && !isEnvironmentDisabled(this.env), 'CONTROL_DISABLED', 'Workflow execution was disabled');
      const current = config.providers.find(provider => provider.id === envelope.provider.id);
      requireValue(current?.enabled && current.capabilities.read && (envelope.access === 'read_only' || current.capabilities.write), 'PROVIDER_DISABLED', 'Provider permission was revoked');
      requireValue(!current.requires_user_approval || envelope.provider.requires_user_approval, 'PROVIDER_POLICY_CHANGED', 'Provider now requires a new approval');
      requireValue(canonicalJSON(current.config) === canonicalJSON(envelope.provider.config), 'PROVIDER_CONFIG_CHANGED', 'Managed Provider configuration changed during the attempt');
    };
    await entry.authorize();
    entry.broker = await createCodexToolBroker({
      workspace: envelope.workspace, access: envelope.access, allowedPaths: envelope.effective_allowed_paths,
      deniedPaths: [this.configPath, runtime.workflows.root, runtime.runs.root, join(dirname(this.configPath), 'workflow-expansion-jobs'), this.parent],
      inputRoots: typeof envelope.inputs.task_root === 'string' && isAbsolute(envelope.inputs.task_root) ? [{ name: 'task_root', path: envelope.inputs.task_root }] : [],
      executionBinding: record.state.constraints?.execution_binding,
      resources: await resourceItems(runtime, runId, envelope), authorize: entry.authorize, recoverToolErrors: true,
      onOperation: async metadata => { await event('tool_operation', metadata); if (metadata.tool === 'write_workspace' && metadata.phase === 'committed') entry.writes.add(metadata.path); },
    });
    if (adapter.settings.authentication.mode === 'host_chatgpt' && this.hostAuthBinary !== adapter.settings.codex_binary) {
      this.hostAuth?.clear(); this.hostAuth = createHostAuthBroker({ binary: adapter.settings.codex_binary, cwd: this.parent, env: this.env }); this.hostAuthBinary = adapter.settings.codex_binary;
    }
    const env = augmentedEnvironment(this.env, record.state.constraints?.runtime_environment);
    entry.session = await this.sessionFactory({
      parent: this.parent, owner: { run_id: runId, node_id: args.node_id, attempt_id: args.attempt_id },
      hostAuth: adapter.settings.authentication.mode === 'host_chatgpt' ? this.hostAuth : undefined,
      binary: adapter.settings.codex_binary, expectedBinaryHash: adapter.settings.binary_sha256,
      model: adapter.model, effort: adapter.effort, cwd: envelope.workspace, access: envelope.access, env, toolBroker: entry.broker, authorize: entry.authorize,
      hostExecutionOnly: Boolean(record.state.constraints?.execution_binding),
      onProfilePrepared: profile => event('profile_owned', { home: profile.home, executable_sha256: profile.binary_sha256 }),
      onModelCatalog: metadata => event('model_catalog', metadata),
      onEvent: raw => {
        if (!['thread/started', 'turn/started', 'turn/completed', 'thread/tokenUsage/updated', 'item/started', 'item/completed', 'error'].includes(raw.method)) return;
        const params = raw.params ?? {};
        const emitted = { method: raw.method, thread_id: params.threadId ?? params.thread?.id ?? null, turn_id: params.turnId ?? params.turn?.id ?? null, status: params.turn?.status ?? params.item?.status ?? null };
        if (raw.method === 'item/started' || raw.method === 'item/completed') emitted.item_type = params.item?.type ?? null;
        if (raw.method === 'error') emitted.diagnostic = diagnosticOf(params.error?.message ?? params.message ?? 'App Server emitted an error without a message');
        return event('codex_event', emitted);
      },
    });
    entry.status = 'running'; await event('session_state', { status: 'running' });
    const semanticSchema = managedNativeResultSchema(definition);
    const prompt = prepared.prompt
      + '\n\nReturn only a JSON value matching the requested semantic result schema. Do not include Workflow protocol fields.';
    const result = await entry.session.turn(prompt, { output_schema: semanticSchema, timeout_ms: 600000 });
    await entry.session.close(); entry.session = null; await event('session_state', { status: 'closed' });
    let output;
    try { output = JSON.parse(result.output); } catch { throw Object.assign(new Error('Managed native result is not JSON'), { code: 'MANAGED_NATIVE_OUTPUT_JSON' }); }
    validateData(output, semanticSchema);
    const after = await snapshotWorkspace(envelope.workspace); const changed = changedPaths(before, after);
    const outside = envelope.access === 'read_only' ? changed : changed.filter(path => !envelope.effective_allowed_paths.some(boundary => within(path, boundary)));
    requireValue(outside.length === 0, 'MANAGED_NATIVE_SCOPE_VIOLATION', 'Managed native child changed paths outside its declared write scope', { changed_paths: changed, outside_paths: outside });
    const completion = hostCompletionEnvelope(definition, {
      output, summary: `Managed ${adapter.model} child completed ${definition.id}`, artifacts: changed,
      changed_paths: changed, outside_paths: [],
      evidence: [{ kind: 'managed_native_result', thread_id: result.thread_id, turn_id: result.turn_id, audit: result.audit, item_types: result.item_types, command_audit: result.command_audit }],
    }, false);
    const request_id = `dispatch-${args.attempt_id}`;
    await runtime.recordUsage(runId, { ...args, request_id, usage: result.usage });
    const saved = await runtime.runs.saveExecutorResult(runId, args.attempt_id, completion);
    await event('result_proposed', { ...saved, final_acceptance_required: false });
    const settled = await runtime.completeNode(runId, { ...args, completion });
    entry.status = settled.nodes[args.node_id].status === 'failed' ? 'failed' : 'succeeded'; this.compact(entry);
    return { status: entry.status };
  }
  async fail(entry, cause) {
    entry.stopping = true; entry.broker?.revoke(); const failures = [cause];
    try { if (entry.session) { await entry.session.close(); entry.session = null; } } catch (error) { failures.push(error); }
    if (cause?.usage) try { await entry.runtime.recordUsage(entry.runId, { ...entry.args, request_id: `dispatch-${entry.args.attempt_id}`, usage: cause.usage }); } catch (error) { failures.push(error); }
    const code = codeOf(cause);
    try {
      const state = await entry.runtime.get(entry.runId); const node = state.nodes[entry.args.node_id];
      const diagnostic = diagnosticOf(cause);
      if (node?.active_attempt_id === entry.args.attempt_id && ['claimed', 'running'].includes(node.status)) await entry.runtime.failNode(entry.runId, { ...entry.args, error: { code, message: diagnostic } });
      await entry.runtime.recordExecutorEvent(entry.runId, { ...entry.args, event: { kind: 'session_state', metadata: { status: 'failed', code, diagnostic } } });
    } catch (error) { failures.push(error); }
    entry.status = failures.length === 1 ? 'failed' : 'audit_or_cleanup_failed'; entry.error = { code, secondary_codes: failures.slice(1).map(codeOf) };
    this.compact(entry); return { status: entry.status, error: entry.error };
  }
  compact(entry) { entry.session = null; entry.broker = null; entry.authorize = null; entry.prepared = null; entry.runtime = null; entry.job = null; entry.writes = new Set(); }
  async stopRun(runId) {
    const entries = [...this.entries.values()].filter(entry => entry.runId === runId && !['succeeded', 'failed', 'audit_or_cleanup_failed'].includes(entry.status));
    for (const entry of entries) { entry.stopping = true; entry.broker?.revoke(); await entry.session?.interrupt(); await entry.session?.close(); }
    await Promise.allSettled(entries.map(entry => entry.done).filter(Boolean));
  }
  async close() { for (const runId of new Set([...this.entries.values()].map(entry => entry.runId))) await this.stopRun(runId); this.hostAuth?.clear(); }
}
