import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCodexClient } from './codex-app-server-client.mjs';
import { agentTurnActivity } from './agent-activity.mjs';
import { authenticatedModel } from './codex-model-catalog.mjs';
import { buildCodexProfile, cleanupCodexProfile, recordProfileChild, isolatedEnvironment, profileOverrides, STRICT_INSTRUCTIONS } from './codex-profile-builder.mjs';
import { canonicalJSON, digest } from '../workflow-revisions.mjs';
import { requireValue, noSymlinks } from '../workflow-paths.mjs';

const MANAGED_INSTRUCTIONS = STRICT_INSTRUCTIONS + ' The host supplies scoped list_workspace, read_workspace, write_workspace, read-only list_input/read_input task mounts, and (when declared) read_workflow_resource and run_task_program tools. Use list_input/read_input for declared external task inputs, workspace tools for workspace files, and write_workspace for all direct text-file edits. When run_task_program is present, it is the authoritative inherited execution environment: use it for task execution and verification; never substitute the local shell or rediscover platform paths. Otherwise use the built-in sandboxed shell only to execute and verify authorized task programs. Do not use shell redirection or shell write commands to create or edit text files. Once the required artifacts have been written and verified, immediately return the requested semantic JSON; do not keep exploring alternatives after task completion. Work directly in the exact current workspace. Do not inspect Codex configuration, Skills, plugins, conversation history, workflow control state, or other tasks. Never invent or return task IDs, agent IDs, attempts, leases, receipts, or completion envelopes; return only the requested semantic JSON result.';
const MANAGED_OVERRIDES = [
  'sandbox_mode = "workspace-write"',
  'features.unified_exec = true',
  'features.shell_tool = true',
  'features.shell_snapshot = true',
];

function safeTurnDiagnostic(events, threadId, turnId) {
  const raw = [...events].reverse().find(item => item.method === 'error'
    && (!item.params?.threadId || item.params.threadId === threadId)
    && (!item.params?.turnId || item.params.turnId === turnId));
  const error = raw?.params?.error ?? raw?.params;
  const message = typeof error?.message === 'string' ? error.message
    : typeof raw?.params?.message === 'string' ? raw.params.message : 'no error diagnostic emitted';
  const code = typeof error?.code === 'string' ? error.code
    : typeof error?.codexErrorInfo?.code === 'string' ? error.codexErrorInfo.code : null;
  const scrubbed = message.replace(/\bBearer\s+\S+/ig, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|cookie|secret)\s*[:=]\s*)\S+/ig, '$1[redacted]')
    .slice(0, 1500);
  return `${code ? `${code}: ` : ''}${scrubbed}`;
}

function usageFrom(events, threadId, turnId) {
  const event = [...events].reverse().find(item => item.method === 'thread/tokenUsage/updated' && item.params?.threadId === threadId && item.params?.turnId === turnId);
  const usage = event?.params?.tokenUsage?.last;
  if (!usage) return { unknown: true };
  for (const field of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens']) requireValue(Number.isSafeInteger(usage[field]) && usage[field] >= 0, 'CODEX_USAGE_SCHEMA', 'Managed native token usage is malformed');
  return { unknown: true, input_tokens: usage.inputTokens, cached_input_tokens: usage.cachedInputTokens,
    cache_write_input_tokens: usage.cacheWriteInputTokens ?? 0, output_tokens: usage.outputTokens, reasoning_output_tokens: usage.reasoningOutputTokens };
}

function scrubDiagnostic(value, limit = 1000) {
  return String(value ?? '')
    .replace(/\bBearer\s+\S+/ig, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|cookie|secret)\s*[:=]\s*)\S+/ig, '$1[redacted]')
    .slice(0, limit);
}

function commandAudit(items) {
  return items.filter(item => item.type === 'commandExecution').map(item => ({
    status: item.status ?? null, exit_code: Number.isInteger(item.exitCode) ? item.exitCode : null,
    cwd: scrubDiagnostic(item.cwd, 1000), command: scrubDiagnostic(item.command, 1000), output: scrubDiagnostic(item.aggregatedOutput, 2000),
  }));
}

export function managedThreadStartParams({ cwd, model, access, dynamicTools = [] }) {
  const sandbox = access === 'read_only' ? 'read-only' : 'workspace-write';
  return {
    cwd, model, allowProviderModelFallback: false, approvalPolicy: 'never', sandbox, ephemeral: true,
    runtimeWorkspaceRoots: [cwd], baseInstructions: MANAGED_INSTRUCTIONS, developerInstructions: '',
    dynamicTools: structuredClone(dynamicTools), selectedCapabilityRoots: [],
  };
}

export async function createManagedNativeSession(options) {
  const { cwd, model, effort, access, env = process.env, onEvent = () => {} } = options;
  const profile = await buildCodexProfile(options);
  let client; let activeThread = null; let activeTurn = null; let closed = false; let closing;
  try {
    if (options.onProfilePrepared) await options.onProfilePrepared(structuredClone(profile));
    await noSymlinks(options.binary);
    requireValue(digest(await readFile(options.binary)) === profile.binary_sha256, 'CODEX_BINARY_CHANGED', 'Codex executable changed before managed native launch');
    client = createCodexClient(options.binary, {
      home: profile.home,
      cwd,
      overrides: [...profileOverrides(profile), ...(options.hostExecutionOnly ? [] : MANAGED_OVERRIDES)],
      env: isolatedEnvironment(env, profile.home),
      onAuthRefresh: options.hostAuth ? params => options.hostAuth.credentials({ force: true, previousAccountId: params?.previousAccountId }) : undefined,
      async onToolCall(params) {
        requireValue(!closed && params.threadId === activeThread && !params.namespace, 'CODEX_TOOL_DENIED', 'Tool call is outside this managed node execution envelope');
        requireValue(options.toolBroker, 'CODEX_TOOL_DENIED', 'No managed workspace/resource broker was authorized');
        return options.toolBroker.call(params.tool, params.arguments, params.callId);
      },
      onEvent,
    });
    await recordProfileChild(profile, client.pid);
    await client.call('initialize', { clientInfo: { name: 'codex_agents_workflow_managed_native', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    client.initialized();
    if (options.hostAuth) {
      const credentials = await options.hostAuth.credentials();
      await client.call('account/login/start', { type: 'chatgptAuthTokens', ...credentials });
    }
    const account = await client.call('account/read', { refreshToken: false });
    requireValue(account?.account || account?.requiresOpenaiAuth === false, 'HOST_AUTH_UNAVAILABLE', 'Managed native executor has no authenticated Codex account');
    await authenticatedModel(client, model, effort, options.onModelCatalog);
  } catch (error) {
    const failures = [error];
    if (client) try { await client.close(); } catch (cause) { failures.push(cause); }
    try { await cleanupCodexProfile(profile); } catch (cause) { failures.push(cause); }
    if (failures.length > 1) throw Object.assign(new AggregateError(failures, 'Managed native setup/cleanup failed'), { code: 'MANAGED_NATIVE_SETUP_FAILED', retained_at: profile.home });
    throw error;
  }
  return {
    profile,
    async turn(text, { output_schema, timeout_ms = 600000 } = {}) {
      requireValue(!closed && !activeThread, 'MANAGED_NATIVE_BUSY', 'Each managed native profile executes one fresh node');
      requireValue(typeof text === 'string' && text.length > 0 && text.length <= 200000, 'CODEX_PROMPT_LIMIT', 'Managed native prompt must be bounded text');
      const sandbox = access === 'read_only' ? 'read-only' : 'workspace-write';
      // Do not send `environments: []`: App Server defines that value as an
      // explicit request to disable environment access, which also removes the
      // built-in local execution surface needed by write nodes. Omission selects
      // the host's default local environment; sandbox/runtime roots still bound it.
      const started = await client.call('thread/start', managedThreadStartParams({ cwd, model, access, dynamicTools: options.toolBroker?.tools() ?? [] }));
      requireValue(Array.isArray(started.instructionSources) && started.instructionSources.length === 0 && started.model === model && typeof started.thread?.id === 'string', 'CODEX_THREAD_UNCONTROLLED', 'Managed native thread loaded unexpected instructions or substituted its model');
      activeThread = started.thread.id;
      const input = [{ type: 'text', text }];
      const after = client.events.length;
      try {
        const begun = await client.call('turn/start', { threadId: activeThread, effort, input, ...(output_schema ? { outputSchema: output_schema } : {}) });
        requireValue(typeof begun.turn?.id === 'string', 'CODEX_TURN_SCHEMA', 'Managed native turn returned no identity');
        activeTurn = begun.turn.id;
        const completed = await client.waitFor(event => event.method === 'turn/completed' && event.params?.threadId === activeThread && event.params?.turn?.id === activeTurn, {
          after,
          timeout: timeout_ms,
          activity: event => agentTurnActivity(event, activeThread, activeTurn),
        });
        requireValue(completed.params.turn.status === 'completed', 'CODEX_TURN_FAILED',
          `Managed native turn ended with status ${completed.params.turn.status}: ${safeTurnDiagnostic(client.events.slice(after), activeThread, activeTurn)}`);
        const items = client.events.slice(after).filter(event => event.method === 'item/completed' && event.params?.threadId === activeThread && event.params?.turnId === activeTurn).map(event => event.params.item);
        const output = items.filter(item => item.type === 'agentMessage').map(item => item.text).join('\n').trim();
        requireValue(output.length > 0, 'CODEX_OUTPUT_EMPTY', 'Managed native node returned no semantic result');
        return {
          output,
          thread_id: activeThread,
          turn_id: activeTurn,
          usage: usageFrom(client.events.slice(after), activeThread, activeTurn),
          item_types: items.map(item => item.type),
          command_audit: commandAudit(items),
          audit: {
            executable_sha256: profile.binary_sha256,
            profile_hash: digest(await readFile(join(profile.home, 'config.toml'))),
            input_sha256: digest(canonicalJSON(input)),
            sandbox,
            instruction_sources: [],
          },
        };
      } catch (error) {
        const usage = usageFrom(client.events.slice(after), activeThread, activeTurn);
        try { await this.close(); } catch (cleanupError) { throw Object.assign(new AggregateError([error, cleanupError], 'Managed native turn and shutdown failed'), { usage }); }
        error.usage = usage;
        throw error;
      } finally {
        activeThread = null; activeTurn = null;
      }
    },
    async interrupt() { if (activeThread && activeTurn) await client.call('turn/interrupt', { threadId: activeThread, turnId: activeTurn }); },
    async close() {
      if (closing) return closing;
      closed = true; options.toolBroker?.revoke();
      closing = (async () => {
        await client.close();
        let timer; let outcome;
        try {
          outcome = options.toolBroker ? await Promise.race([options.toolBroker.quiesce(), new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error('Managed workspace tool did not quiesce; retain profile'), { code: 'CODEX_BROKER_SHUTDOWN_TIMEOUT' })), 5000);
          })]) : null;
        } finally { clearTimeout(timer); }
        await cleanupCodexProfile(profile);
        if (outcome?.error) throw Object.assign(new Error('Managed workspace tool failed during shutdown'), { code: 'CODEX_BROKER_SHUTDOWN_FAILURE', cause: outcome.error, profile_cleaned: true });
      })();
      return closing;
    },
  };
}
