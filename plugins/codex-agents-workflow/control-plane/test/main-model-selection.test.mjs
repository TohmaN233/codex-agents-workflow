import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from './physical-tempdir.mjs';
import { readMainTurnContext, resolveMainModelSelection } from '../lib/execution/main-model-selection.mjs';
import { validateStrictConfig } from '../lib/execution/strict-config.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'workflow-main-selection-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, 'sessions'));
  const id = '01a0db25-ad92-72a0-b6fa-2519a6cfa2f8', path = join(home, 'sessions', 'caller.jsonl');
  const line = (type, payload) => JSON.stringify({ type, payload }) + '\n';
  await writeFile(path, line('session_meta', { id }) + line('turn_context', { model: 'current-chat-model', effort: 'xhigh' }));
  return { home, thread: { id, path }, line };
}

test('Main has no fixed default model or reasoning effort', () => {
  const settings = validateStrictConfig();
  assert.equal(settings.main_model, '');
  assert.equal(settings.main_reasoning_effort, '');
});

test('authenticated chat model and effort override old experiment settings without loading prompts', async t => {
  const f = await fixture(t), calls = [];
  await appendFile(f.thread.path, f.line('response_item', { text: 'irrelevant model gpt-6-sol and effort medium' }));
  const selection = await resolveMainModelSelection({ state: { constraints: { native_parent_thread_id: f.thread.id } } },
    { main_model: 'gpt-6-sol', main_reasoning_effort: 'medium' }, {
      env: { CODEX_HOME: f.home },
      observe: async action => action({ call: async (method, params) => {
        calls.push(method); assert.equal(method, 'thread/read');
        assert.equal(params.threadId, f.thread.id); assert.equal(params.includeTurns, false);
        return { thread: f.thread };
      } }),
    });
  assert.deepEqual(selection, { model: 'current-chat-model', effort: 'xhigh' });
  assert.deepEqual(calls, ['thread/read']);
  await appendFile(f.thread.path, f.line('turn_context', { model: 'changed-chat-model', effort: 'high' }));
  const path = process.platform === 'win32' ? '\\\\?\\' + f.thread.path : f.thread.path;
  assert.deepEqual(await readMainTurnContext({ ...f.thread, path }, f.home), { model: 'changed-chat-model', effort: 'high' });
});

test('standalone console follows current Codex settings with zero model turns', async () => {
  const calls = [];
  const selection = await resolveMainModelSelection({ state: {} }, validateStrictConfig(), {
    observe: async action => action({ call: async (method, params) => {
      calls.push(method); assert.deepEqual(params, { includeLayers: false });
      return { config: { model: 'user-selected-model', model_reasoning_effort: 'low' } };
    } }),
  });
  assert.deepEqual(selection, { model: 'user-selected-model', effort: 'low' });
  assert.deepEqual(calls, ['config/read']);
});

test('automatic effort uses the selected model default instead of a fixed medium preset', async () => {
  const selection = await resolveMainModelSelection({ state: {} }, validateStrictConfig(), {
    observe: async action => action({ call: async method => method === 'config/read'
      ? { config: { model: 'user-selected-model', model_reasoning_effort: null } }
      : { data: [{ model: 'user-selected-model', defaultReasoningEffort: 'high' }], nextCursor: null } }),
  });
  assert.deepEqual(selection, { model: 'user-selected-model', effort: 'high' });
});

test('explicit isolated experiments remain selectable without changing Workflow data', async () => {
  const record = { state: {}, pins: { root: { workflow: { nodes: [{ executor: { kind: 'main' } }] } } } };
  const before = structuredClone(record);
  assert.deepEqual(await resolveMainModelSelection(record, { main_model: 'experiment-model', main_reasoning_effort: 'medium' },
    { observe: () => assert.fail('explicit isolated experiment does not read another session') }),
    { model: 'experiment-model', effort: 'medium' });
  assert.deepEqual(record, before);
});

test('invalid caller identity and missing context fail visibly without another model fallback', async t => {
  const f = await fixture(t);
  await assert.rejects(readMainTurnContext({ ...f.thread, id: 'different-thread' }, f.home), { code: 'MAIN_MODEL_SESSION_IDENTITY' });
  await writeFile(f.thread.path, f.line('session_meta', { id: f.thread.id }));
  await assert.rejects(readMainTurnContext(f.thread, f.home), { code: 'MAIN_MODEL_SESSION_CONTEXT' });
  await assert.rejects(resolveMainModelSelection({ state: {} }, validateStrictConfig(), {
    observe: async action => action({ call: async () => ({ config: {} }) }),
  }), { code: 'MAIN_MODEL_SELECTION' });
});
