import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from './physical-tempdir.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createStdioRequestScheduler } from '../server.mjs';

const controlDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginDir = dirname(controlDir);
const serverPath = join(controlDir, 'server.mjs');

test('plugin MCP uses a stable parent and fresh registry resolution with the global Codex environment', async () => {
  const manifest = JSON.parse(await readFile(join(pluginDir, '.mcp.json'), 'utf8'));
  const server = manifest.mcpServers['codex-agents-workflow'];
  assert.equal(server.enabled, true);
  assert.equal(server.cwd, '../../..');
  const bootstrap=await readFile(join(pluginDir,'scripts/mcp-bootstrap.cjs'),'utf8');
  assert.ok(server.args[1].startsWith(bootstrap));
  assert.equal(server.args[0], '-e'); // The subprocess regression verifies the packaged bootstrap.
  assert.ok(server.env_vars.includes('CODEX_HOME'));
  assert.ok(server.env_vars.includes('USERPROFILE'));
});

test('routing policy leaves the primary model to the host and never auto-falls back', async () => {
  const controlSkill = await readFile(join(pluginDir, 'skills', 'control-plane', 'SKILL.md'), 'utf8');
  const nativeSkill = await readFile(join(pluginDir, 'skills', 'orchestration', 'SKILL.md'), 'utf8');
  const legacySkill = await readFile(join(pluginDir, 'skills', 'control-plane', 'references', 'v6-control-plane.md'), 'utf8');
  assert.doesNotMatch(controlSkill, /use the native[\s\S]{0,100}workflow or stay solo/i);
  assert.match(controlSkill, /Report the observed error/i);
  assert.doesNotMatch(nativeSkill, /ask the user to confirm[\s\S]{0,80}stop[\s\S]{0,40}until confirmed/i);
  for (const skill of [controlSkill, nativeSkill, legacySkill]) {
    assert.doesNotMatch(skill, /recommended primary|qualifying primary|confirm the primary session|GPT-5\.6 Luna never qualifies/i);
  }
  assert.match(legacySkill, /delegate is the default/i);
  assert.match(legacySkill, /full[\s\S]{0,120}(difficult|high-risk)/i);
  assert.doesNotMatch(controlSkill, /legacy|version: [67]|\bv[67]\b/);
  const recovery = await readFile(join(pluginDir, 'skills/control-plane/references/recovery.md'), 'utf8');
  for (const operation of ['workflow_start', 'workflow_claim_node', 'workflow_dispatch', 'workflow_complete_node', 'workflow_reattach_connector']) assert((controlSkill + recovery).includes(operation));
  const connection = await readFile(join(pluginDir, 'skills/control-plane/references/connection.md'), 'utf8');
  assert.match(connection, /Never claim connection recovery before a host tool call\s+succeeds/i);
  assert.match(controlSkill, /Never fabricate a receipt or silently substitute/);
  assert.match(nativeSkill, /delegate is the default/i);
});

function makeClient(child) {
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
  });
  return {
    request(message) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(message.id);
          reject(new Error(`timeout waiting for ${message.id}`));
        }, 5000);
        pending.set(message.id, (response) => {
          clearTimeout(timer);
          resolve(response);
        });
        child.stdin.write(`${JSON.stringify(message)}\n`);
      });
    },
  };
}

test('stdio scheduler bounds work, keeps a control lane, and drains in-flight requests on shutdown', async () => {
  const writes = [];
  const resolvers = new Map();
  const scheduler = createStdioRequestScheduler({
    maxGeneral: 2,
    maxControl: 1,
    maxPending: 2,
    handle: async (request) => new Promise((resolve) => resolvers.set(request.id, resolve)),
    write: (response) => writes.push(response),
  });
  assert.equal(scheduler.submit({ id: 1, method: 'tools/call', params: { name: 'codex_agents_workflow_invoke' } }), true);
  assert.equal(scheduler.submit({ id: 2, method: 'tools/call', params: { name: 'codex_agents_workflow_invoke' } }), true);
  assert.equal(scheduler.submit({ id: 3, method: 'tools/call', params: { name: 'codex_agents_workflow_invoke' } }), true);
  assert.equal(scheduler.submit({ id: 4, method: 'tools/call', params: { name: 'workflow_cancel' } }), true);
  assert.equal(scheduler.submit({ id: 5, method: 'tools/call', params: { name: 'codex_agents_workflow_invoke' } }), true);
  assert.equal(scheduler.submit({ id: 6, method: 'tools/call', params: { name: 'codex_agents_workflow_invoke' } }), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(scheduler.snapshot().active, { control: 1, general: 2 });
  assert.equal(scheduler.snapshot().pending, 2);

  const shutdown = scheduler.shutdown();
  assert.equal(scheduler.snapshot().accepting, false);
  assert.equal(scheduler.snapshot().pending, 0);
  assert.equal(writes.find((response) => response.id === 3)?.error?.data?.code, 'SERVER_SHUTTING_DOWN');
  assert.equal(writes.find((response) => response.id === 5)?.error?.data?.code, 'SERVER_SHUTTING_DOWN');
  assert.equal(writes.find((response) => response.id === 6)?.error?.data?.code, 'SERVER_BUSY');
  assert.equal(scheduler.submit({ id: 7, method: 'ping' }), false);
  assert.equal(writes.find((response) => response.id === 7)?.error?.data?.code, 'SERVER_SHUTTING_DOWN');
  assert(writes.every(response => Number.isInteger(response.error.code)));
  assert.equal(scheduler.snapshot().in_flight, 3);

  for (const resolve of resolvers.values()) resolve({ jsonrpc: '2.0', id: 0, result: {} });
  await shutdown;
  assert.equal(scheduler.snapshot().in_flight, 0);
});

test('stdio MCP lists control tools and returns sanitized status', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'sol-control-mcp-'));
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, SOL_CONTROL_CONFIG: join(dir, 'control-plane.json') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => {
    child.stdin.end();
    child.kill('SIGTERM');
  });
  const client = makeClient(child);
  const discovered = await client.request({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} });
  assert.equal(discovered.result.protocolVersion, '2026-07-28');
  assert.equal(discovered.result.serverInfo.name, 'codex-agents-workflow');

  const initialized = await client.request({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');

  const listed = await client.request({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
  const names = listed.result.tools.map((tool) => tool.name);
  assert.deepEqual(names.filter(name => name.startsWith('codex_agents_workflow_')), ['codex_agents_workflow_status', 'codex_agents_workflow_console', 'codex_agents_workflow_resolve', 'codex_agents_workflow_connector_probe', 'codex_agents_workflow_connector_start', 'codex_agents_workflow_connector_status', 'codex_agents_workflow_connector_control', 'codex_agents_workflow_invoke']);
  assert.equal(names.some(name => name.startsWith('sol_')), false);
  for (const name of ['workflow_start', 'workflow_claim_node', 'workflow_complete_node', 'workflow_resume', 'workflow_dispatch']) assert(names.includes(name));
  const consoleTool = listed.result.tools.find((tool) => tool.name === 'codex_agents_workflow_console');
  assert.equal(consoleTool.inputSchema.properties.port.default, 58712);
  const resolveTool = listed.result.tools.find((tool) => tool.name === 'codex_agents_workflow_resolve');
  assert.deepEqual(resolveTool.inputSchema.required, ['task_type_id', 'task']);
  assert.equal('scenario_id' in resolveTool.inputSchema.properties, false);
  const startTool = listed.result.tools.find((tool) => tool.name === 'codex_agents_workflow_connector_start');
  assert.ok(startTool.inputSchema.required.includes('stage_id'));

  const statusResponse = await client.request({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'codex_agents_workflow_status', arguments: {} },
  });
  const status = JSON.parse(statusResponse.result.content[0].text);
  assert.equal(status.effective_enabled, true);
  assert.ok(status.task_types.some((taskType) => taskType.id === 'bounded-code-change'));
  assert.doesNotMatch(statusResponse.result.content[0].text, /CONSTRAINTS AND OWNERSHIP/);
  assert.doesNotMatch(statusResponse.result.content[0].text, /example\.invalid/);

  const connectorError = await client.request({
    jsonrpc: '2.0', id: 5, method: 'tools/call', params: {
      name: 'codex_agents_workflow_connector_status', arguments: { task_id: 'missing-task' },
    },
  });
  assert.equal(connectorError.result.isError, true);
  const errorPayload = JSON.parse(connectorError.result.content[0].text);
  assert.equal(errorPayload.code, 'TASK_NOT_FOUND');
  assert.match(errorPayload.error, /Unknown connector task/);
});


test('real stdio server keeps ping responsive and drains invocation before signal cleanup', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-stdio-drain-'));
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const reached = new Promise(resolve => { entered = resolve; });
  const resultText = 'drained result:' + 'x'.repeat(1536 * 1024);
  const http = createServer(async (req, res) => {
    req.resume(); entered(); await gate;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{message:{content:resultText}}] }));
  });
  http.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(() => { release(); http.closeAllConnections(); http.close(); });
  const config = JSON.parse(await readFile(join(controlDir, 'default-config.json'), 'utf8'));
  config.global.allow_direct_api = true;
  const provider = config.providers.find(p => p.id === 'custom-openai-compatible');
  provider.enabled = true; provider.config.auth_type = 'none'; provider.config.timeout_ms = 10000;
  provider.config.endpoint = `http://127.0.0.1:${http.address().port}/chat`;
  config.task_types.push({ id:'drain-test', name:'Drain test', enabled:true, route:'audit', stages:[{id:'review', role:'reviewer', provider_id:provider.id, access:'read_only', template:'{{task}}'}] });
  const configPath = join(root, 'control-plane.json'); await writeFile(configPath, JSON.stringify(config));
  const args = process.platform === 'win32' ? ['--import', pathToFileURL(join(controlDir, 'test/fixtures/windows-signal.mjs')).href, serverPath] : [serverPath];
  const child = spawn(process.execPath, args, { env: {...process.env, CODEX_WORKFLOW_CONFIG:configPath, CODEX_WORKFLOW_DISABLED:'0', SOL_CONTROL_DISABLED:'0'}, stdio:['pipe','pipe','pipe','ipc'], windowsHide:true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stderr = ''; child.stderr.on('data', data => { stderr += data; });
  const exit = once(child, 'exit');
  const client = makeClient(child);
  const invocation = client.request({jsonrpc:'2.0', id:101, method:'tools/call', params:{name:'codex_agents_workflow_invoke', arguments:{task_type_id:'drain-test', stage_id:'review', task:'Wait for test gate'}}});
  // Surface early rejection instead of waiting silently for an unreachable gate.
  await Promise.race([reached, invocation.then(value => { throw new Error(JSON.stringify(value)); })]);
  assert.deepEqual((await client.request({jsonrpc:'2.0',id:102,method:'ping'})).result, {});
  if (process.platform === 'win32') child.send('emit-sigterm'); else child.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(child.exitCode, null, stderr);
  assert.equal(child.signalCode, null, stderr);
  child.stdout.pause();
  release();
  await new Promise(resolve => setTimeout(resolve, 250));
  // Windows may buffer the entire reply before the parent resumes; the exact
  // received payload below is the portable delivery contract.
  child.stdout.resume();
  const response = await invocation;
  assert.equal(response.result.isError, undefined, JSON.stringify(response));
  assert.equal(JSON.parse(response.result.content[0].text).response.text, resultText);
  const [code, signal] = await exit; assert.equal(code, 0, stderr); assert.equal(signal, null);
  assert.match(await readFile(join(root, 'control-plane-audit.jsonl'), 'utf8'), /"outcome":"ok"/);
});


test('stdio scheduler shutdown waits for asynchronous response write completion', async () => {
  let release, entered;
  const writeGate = new Promise(resolve => { release = resolve; });
  const writeStarted = new Promise(resolve => { entered = resolve; });
  const scheduler = createStdioRequestScheduler({
    handle: async request => ({ jsonrpc: '2.0', id: request.id, result: {} }),
    write: () => { entered(); return writeGate; },
  });
  scheduler.submit({ id: 1, method: 'ping' });
  await writeStarted;
  let drained = false;
  const shutdown = scheduler.shutdown().then(() => { drained = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(drained, false);
  release(); await shutdown;
  assert.equal(drained, true);
});
