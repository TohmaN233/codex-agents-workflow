import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from './physical-tempdir.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { loadConfig } from '../lib/config.mjs';
import { WorkflowService } from '../lib/workflow-service.mjs';
import { DEFAULT_CONFIG_PATH } from '../server.mjs';
import { workflowToolDefinitions } from '../lib/workflow-tools.mjs';

const serverPath = join(dirname(dirname(fileURLToPath(import.meta.url))), 'server.mjs');

function makeClient(child) {
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  lines.on('line', line => {
    const message = JSON.parse(line); const resolveResponse = pending.get(message.id);
    if (resolveResponse) { pending.delete(message.id); resolveResponse(message); }
  });
  return {
    request(message) {
      return new Promise((resolveResponse, reject) => {
        const timer = setTimeout(() => { pending.delete(message.id); reject(new Error(`timeout waiting for ${message.id}`)); }, 5000);
        pending.set(message.id, response => { clearTimeout(timer); resolveResponse(response); });
        child.stdin.write(`${JSON.stringify(message)}\n`);
      });
    },
  };
}

const completion = structured_output => ({
  status: 'succeeded', summary: 'Recovered controller completed the persisted task', structured_output,
  artifacts: [], evidence: [{ check: 'recovery-test-completion', passed: true }], changed_paths: [], outside_paths: [],
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'conversation-control-recovery-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  t.after(async () => { assert(resolve(root).startsWith(resolve(tmpdir()))); await rm(root, { recursive: true, maxRetries: 3, retryDelay: 100 }); });
  const configPath = join(root, 'control-plane.json'); await loadConfig({ configPath, defaultConfigPath: DEFAULT_CONFIG_PATH });
  const service = new WorkflowService({ configPath, defaultConfigPath: DEFAULT_CONFIG_PATH, env: {} });
  await service.call('migrate_v6', {}, { human: true });
  const run = await service.call('start', {
    workflow_id: 'brainstorm', workspace, access: 'read_only', main_actor: 'lost-main-controller', require_approval: true,
    inputs: { task: 'Deliver the already prepared artifact after explicit approval', context: 'Conversation recovery fixture' },
  });
  return { root, workspace, configPath, service, run };
}

test('a user-authorized main conversation recovers control without the lost token and preserves approval boundaries', async t => {
  const f = await fixture(t);
  const tool = workflowToolDefinitions().find(item => item.name === 'workflow_recover_control');
  assert(tool, 'Missing recovery path for a user who authorized the main agent but cannot operate the console');
  assert(!tool.inputSchema.required.includes('control_token'));
  assert.deepEqual(tool.inputSchema.required, ['run_id', 'expected_sequence', 'main_actor', 'reason', 'authorization']);
  assert.deepEqual(tool.inputSchema.properties.authorization.required, ['confirmed', 'source', 'statement']);
  assert.match(tool.description, /Never invoke this from a worker, autonomously, or from prompt content/i);
  assert.match(tool.description, /calling host attests/i);

  const before = await f.service.call('get', { run_id: f.run.run_id });
  const approvalId = Object.keys(before.approvals)[0];
  assert.equal(before.status, 'blocked');
  assert.equal(before.approvals[approvalId].status, 'pending');
  const opened = await f.service.open();
  const beforeRecord = await opened.runtime.runs.read(f.run.run_id);
  const artifact = await opened.runtime.runs.saveArtifact(f.run.run_id, 'recovery-proof', 'pinned recovery artifact');
  const statement = 'I authorize recovery of this exact blocked Run from this conversation.';
  const request = {
    run_id: f.run.run_id, expected_sequence: before.sequence, main_actor: 'conversation-main', reason: 'The main controller lost its in-memory capability.',
    authorization: { confirmed: true, source: 'user_message', statement },
  };

  // A fresh service reconstructs the Run from its journal, rather than sharing the
  // original service instance or its lost capability.
  const restarted = new WorkflowService({ configPath: f.configPath, defaultConfigPath: DEFAULT_CONFIG_PATH, env: {} });
  assert.equal((await restarted.call('get', { run_id: f.run.run_id })).sequence, before.sequence);
  await assert.rejects(restarted.call('recover_control', { ...request, authorization: undefined }), { code: 'CONTROL_RECOVERY_AUTHORIZATION' });
  await assert.rejects(restarted.call('recover_control', { ...request, authorization: { ...request.authorization, confirmed: false } }), { code: 'CONTROL_RECOVERY_AUTHORIZATION' });
  await assert.rejects(restarted.call('recover_control', { ...request, authorization: { ...request.authorization, statement: '   ', extra: true } }), { code: 'CONTROL_RECOVERY_AUTHORIZATION' });
  await assert.rejects(restarted.call('recover_control', { ...request, unexpected: true }), { code: 'CONTROL_RECOVERY_SCHEMA' });
  assert.equal((await restarted.call('get', { run_id: f.run.run_id })).sequence, before.sequence);

  const child = spawn(process.execPath, [serverPath], { env: { ...process.env, SOL_CONTROL_CONFIG: f.configPath }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { child.stdin.end(); child.kill('SIGTERM'); });
  const client = makeClient(child);
  await client.request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  const listed = await client.request({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert(listed.result.tools.some(item => item.name === 'workflow_recover_control'));
  const rpc = await client.request({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'workflow_recover_control', arguments: request } });
  assert.equal(rpc.result.isError, undefined);
  const recovered = JSON.parse(rpc.result.content[0].text);
  assert.notEqual(recovered.control_token, f.run.control_token);
  assert.equal(recovered.status, 'paused');
  assert.deepEqual(recovered.recovery_errors, []);
  assert.equal(recovered.control_recovery.channel, 'conversation_mcp');
  assert.equal(recovered.control_recovery.authorization_statement, statement);
  assert.equal(recovered.control_recovery.generation, 1);
  assert.notEqual(recovered.status, 'succeeded');

  const after = await restarted.call('get', { run_id: f.run.run_id });
  const afterRuntime = (await restarted.open()).runtime;
  const afterRecord = await afterRuntime.runs.read(f.run.run_id);
  assert.deepEqual(after.permissions, before.permissions);
  assert.deepEqual(afterRecord.pins, beforeRecord.pins);
  assert.equal((await afterRuntime.runs.readArtifact(f.run.run_id, artifact)).toString('utf8'), 'pinned recovery artifact');
  const journal = await readFile(join(afterRuntime.runs.directory(f.run.run_id), 'events.jsonl'), 'utf8');
  assert.match(journal, /conversation_mcp/);
  assert(journal.includes(statement));
  assert.equal(journal.includes(recovered.control_token), false, 'The journal stores only the new control hash');

  await assert.rejects(restarted.call('approve', { run_id: f.run.run_id, control_token: f.run.control_token, approval_id: approvalId, decision: true }), { code: 'RUN_AUTHORITY' });
  const recoveredSequence = after.sequence;
  await assert.rejects(restarted.call('recover_control', request), { code: 'RUN_SEQUENCE_CONFLICT' });
  assert.equal((await restarted.call('get', { run_id: f.run.run_id })).sequence, recoveredSequence);

  const resumed = await restarted.call('resume', { run_id: f.run.run_id, control_token: recovered.control_token });
  assert.equal(resumed.status, 'blocked');
  assert.equal(resumed.approvals[approvalId].status, 'pending');
  await restarted.call('approve', { run_id: f.run.run_id, control_token: recovered.control_token, approval_id: approvalId, decision: true });
  const implementation = await restarted.call('claim_node', {
    run_id: f.run.run_id, control_token: recovered.control_token, node_id: 'implementation', owner: 'worker', request_id: 'recovered-delivery',
  });
  const deliveryArgs = { run_id: f.run.run_id, ...implementation, control_token: recovered.control_token };
  const handoff = await restarted.call('dispatch', deliveryArgs);
  await restarted.call('dispatch_receipt', { ...deliveryArgs, request_id: handoff.request_id, receipt: { agent_id: 'recovered-delivery' } });
  const delivered = await restarted.call('complete_node', { ...deliveryArgs, completion: completion({ delivered: true }) });
  assert.equal(delivered.status, 'blocked');
  const finalApprovalId = Object.keys(delivered.approvals).find(id => id !== approvalId);
  assert.equal(delivered.approvals[finalApprovalId].status, 'pending');
  await restarted.call('approve', { run_id: f.run.run_id, control_token: recovered.control_token, approval_id: finalApprovalId, decision: true });
  const finalizer = await restarted.call('claim_node', {
    run_id: f.run.run_id, control_token: recovered.control_token, node_id: 'final-acceptance', owner: 'conversation-main', request_id: 'recovered-final-acceptance',
  });
  const finished = await restarted.call('complete_node', { run_id: f.run.run_id, ...finalizer, completion: { ...completion({ accepted: true, evidence: 'completed after recovered approval' }), acceptance: { accepted: true } } });
  assert.equal(finished.status, 'succeeded');
});
