import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunRefresh, loadRunSnapshot } from '../web-src/run-refresh.mjs';
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; }
function snapshot(sequence) { return { state: { sequence }, next: {sequence}, events: [sequence], live: {sequence} }; }
test('later refresh publishes one complete snapshot and discards a late older generation', async () => {
  const control = createRunRefresh(), first = deferred(), second = deferred(), published = [];
  const a = control.refresh(() => first.promise, value => published.push(value));
  const b = control.refresh(() => second.promise, value => published.push(value));
  assert.equal(published.length, 0);
  second.resolve(snapshot(11)); assert.equal(await b, true);
  first.resolve(snapshot(10)); assert.equal(await a, false);
  assert.deepEqual(published, [snapshot(11)]);
  assert.equal(await control.refresh(async () => snapshot(9), value => published.push(value)), false);
  assert.deepEqual(published, [snapshot(11)]);
});
test('selection invalidation rejects in-flight snapshots and current errors remain visible', async () => {
  const control = createRunRefresh(), old = deferred(), published = [];
  const a = control.refresh(() => old.promise, value => published.push(value));
  control.invalidate(); old.resolve(snapshot(20)); assert.equal(await a, false);
  assert.deepEqual(published, []);
  await assert.rejects(control.refresh(async () => { throw new Error('current failure'); }, () => {}), /current failure/);
});

test('an old Run action completing after disposal cannot start or publish another refresh', async () => {
  const control = createRunRefresh(); control.dispose();
  let loaded = false;
  assert.equal(await control.refresh(async () => { loaded = true; return snapshot(99); }, () => assert.fail('published disposed Run')), false);
  assert.equal(loaded, false);
});


test('event polling advances only the published cursor and resets on authority change', async () => {
  const refresh = createRunRefresh(); const calls = []; let published; let head = 2;
  const api = async (_op, args) => {
    calls.push(args.after_sequence);
    return { state: { sequence: head }, next: { sequence: head }, events: [1,2,3].filter(n => n <= head && n > args.after_sequence).map(sequence => ({ sequence })) };
  };
  const poll = authority => refresh.refresh(previous => loadRunSnapshot(api, 'run', authority, previous), value => { published = value; });
  await poll('first'); head = 3; await poll('first');
  assert.deepEqual(calls, [0,2]);
  assert.deepEqual(published.events.map(e => e.sequence), [1,2,3]);
  await poll('rotated'); assert.deepEqual(calls, [0,2,0]);
  const gate = deferred();
  const stale = refresh.refresh(async previous => { await gate.promise; return loadRunSnapshot(api, 'run', 'rotated', previous); }, () => assert.fail('stale published'));
  await poll('rotated'); gate.resolve(); await stale;
  await poll('rotated'); assert.equal(calls.at(-1), 3);
});
