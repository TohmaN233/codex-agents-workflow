import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createCodexClient } from '../lib/execution/codex-app-server-client.mjs';

function fixture(options = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.emit('exit', 0, null); child.emit('close'); };
  const sent = []; child.stdin.on('data', bytes => sent.push(JSON.parse(bytes.toString())));
  const events = [];
  const client = createCodexClient('/fixture', { home: '/fixture', cwd: '/fixture', ...options,
    onEvent: event => events.push(event), spawnImpl: () => child });
  return { client, child, sent, events };
}

test('credential-only RPC cannot create model threads or start login flows', async () => {
  const f = fixture({ credentialOnly: true });
  for (const method of ['thread/start', 'turn/start', 'account/login/start', 'skills/list']) {
    assert.throws(() => f.client.call(method, {}), /outside qualified/);
  }
  assert.deepEqual(f.sent, []);
  const result = f.client.call('getAuthStatus', { includeToken: true, refreshToken: true });
  f.child.stdout.write(JSON.stringify({ id: f.sent[0].id, result: { authMethod: 'chatgpt', authToken: 'fixture-secret' } }) + '\n');
  assert.equal((await result).authToken, 'fixture-secret');
  assert.deepEqual(f.events, []); assert.deepEqual(f.client.events, []);
  await f.client.close();
});

test('token refresh responses stay off worker tools and event logs; raw RPC errors are redacted', async () => {
  let refreshed = false; let toolCalled = false;
  const f = fixture({ onAuthRefresh: async params => { assert.equal(params.previousAccountId, 'fixture-account'); refreshed = true; return { accessToken: 'fixture-secret', chatgptAccountId: 'fixture-account' }; }, onToolCall: () => { toolCalled = true; } });
  f.child.stdout.write(JSON.stringify({ id: 10, method: 'account/chatgptAuthTokens/refresh', params: { previousAccountId: 'fixture-account' } }) + '\n');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshed, true); assert.equal(toolCalled, false);
  assert.equal(f.sent[0].result.accessToken, 'fixture-secret');
  assert.deepEqual(f.events, []); assert.deepEqual(f.client.events, []);
  const failed = f.client.call('account/read', {});
  f.child.stdout.write(JSON.stringify({ id: f.sent[1].id, error: { code: -1, message: 'fixture-secret', data: 'fixture-secret' } }) + '\n');
  await assert.rejects(failed, error => !error.message.includes('fixture-secret') && error.message.includes('code=-1'));
  await f.client.close();
  const other = fixture();
  assert.throws(() => other.client.call('account/login/start', { type: 'chatgptAuthTokens', accessToken: 'fixture-secret' }), /Unsupported authentication flow/);
  await other.client.close();
});
