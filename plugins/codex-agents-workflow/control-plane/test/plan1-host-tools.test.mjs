import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { plan1ActiveChildCount, plan1HostToolRegistry, plan1ToolIdentity, PLAN1_HOST_IMPLEMENTATION_SHA256, PLAN1_PUBLIC_CONTRACT_SHA256, PLAN1_VALIDATION_DEPENDENCIES_SHA256 } from '../lib/execution/plan1-host-tools.mjs';
import { discoverRuntimeEnvironment } from '../lib/runtime-environment.mjs';
import { canonicalJSON, digest } from '../lib/workflow-revisions.mjs';
import { HostToolRunner } from '../lib/execution/host-tool-runner.mjs';

const execFile = promisify(execFileCallback);

test('Plan 1 public host tools preflight frozen inputs and validate only public artifact structure', async t => {
  const root = await mkdtemp(join(tmpdir(), 'plan1-host-tools-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const taskRoot = join(root, 'task'); const workspace = join(root, 'workspace');
  await mkdir(join(taskRoot, 'environment'), { recursive: true }); await mkdir(workspace);
  for (const name of ['earthquakes_2024.json', 'PB2002_boundaries.json', 'PB2002_plates.json']) await writeFile(join(taskRoot, 'environment', name), '{}');
  const input = { task_id: 'earthquake-plate-calculation', task_root: taskRoot, workspace, action: 'input_preflight' };
  const registry = plan1HostToolRegistry(); const read = registry['plan1-native-read-wrapper'];
  assert.deepEqual(read.identity, plan1ToolIdentity('plan1-native-read-wrapper'));
  const preflight = await read.execute({ input });
  assert.equal(preflight.exit_code, 0); assert.equal(preflight.output.public_status, 'ready'); assert.equal(preflight.effects.changed_paths.length, 0);
  await writeFile(join(workspace, 'answer.json'), JSON.stringify({ id: 'x', place: 'p', time: '2026-01-01T00:00:00Z', magnitude: 1, latitude: 2, longitude: 3, distance_km: 4 }));
  const validation = await read.execute({ input: { ...input, action: 'public_validation' } });
  assert.equal(validation.exit_code, 0); assert.equal(validation.output.public_status, 'passed'); assert.equal(validation.effects.changed_paths.length, 0);
  await writeFile(join(workspace, 'answer.json'), '{}');
  assert.equal((await read.execute({ input: { ...input, action: 'public_validation' } })).exit_code, 1);
});

async function publicFixture(t, task_id) {
  const root = await mkdtemp(join(tmpdir(), `plan1-${task_id}-`)); t.after(() => rm(root, { recursive: true, force: true }));
  const task_root = join(root, 'task'); const workspace = join(root, 'workspace'); await mkdir(task_root); await mkdir(workspace);
  return { task_root, workspace, invoke: (action, context = {}) => plan1HostToolRegistry()['plan1-native-read-wrapper'].execute({ input: { task_id, task_root, workspace, action }, context }) };
}
async function rejected(invoke, expected) { const result = await invoke('public_validation'); assert.equal(result.exit_code, 1); assert.match(result.diagnostic, new RegExp(expected)); }

test('Plan 1 public crystal validation rejects tuple, wrong-key, and syntax artifacts', async t => {
  const f = await publicFixture(t, 'crystallographic-wyckoff-position-analysis'); const path = join(f.workspace, 'solution.py');
  await writeFile(path, "def analyze_wyckoff_position_multiplicities_and_coordinates(filepath):\n    # wyckoff_multiplicity_dict wyckoff_coordinates_dict\n    return multiplicities, coordinates\n"); await rejected(f.invoke, 'PLAN1_PUBLIC_SCHEMA');
  await writeFile(path, "def analyze_wyckoff_position_multiplicities_and_coordinates(filepath):\n    return {'wrong_outer_key': {}}\n"); await rejected(f.invoke, 'PLAN1_PUBLIC_SCHEMA');
  await writeFile(path, "def analyze_wyckoff_position_multiplicities_and_coordinates(filepath):\n    return {'wyckoff_multiplicity_dict': {'a': 1}, 'wyckoff_coordinates_dict': {'a': ('0', '1/2', '1/2')}}\n"); await rejected(f.invoke, 'PLAN1_PUBLIC_SCHEMA');
  await writeFile(path, "def analyze_wyckoff_position_multiplicities_and_coordinates(\n"); await rejected(f.invoke, 'PLAN1_PYTHON_SYNTAX');
});

test('Plan 1 crystal shape inspection ignores helper tuples and inspects only the required entry return', async t => {
  const f = await publicFixture(t, 'crystallographic-wyckoff-position-analysis'); const path = join(f.workspace, 'solution.py');
  await writeFile(path, "def helper():\n    return a, b\n\ndef analyze_wyckoff_position_multiplicities_and_coordinates(filepath):\n    return {'wyckoff_multiplicity_dict': {'a': 1}, 'wyckoff_coordinates_dict': {'a': ['0', '1/2', '1/2']}}\n");
  assert.equal((await f.invoke('public_validation')).exit_code, 0);
  await writeFile(path, "def helper():\n    return {'wyckoff_multiplicity_dict': {}, 'wyckoff_coordinates_dict': {'a': ['0', '0', '0']}}\n\ndef analyze_wyckoff_position_multiplicities_and_coordinates(filepath):\n    return {}, {}\n");
  await rejected(f.invoke, 'PLAN1_PUBLIC_SCHEMA');
});

test('Plan 1 cancellation waits for its exact active Python child to settle before attesting no child', async t => {
  const f = await publicFixture(t, 'crystallographic-wyckoff-position-analysis'); const context = { run_id: 'cancel-run', node_id: 'crystal', attempt_id: 'attempt' }; const controller = new AbortController();
  await writeFile(join(f.workspace, 'solution.py'), `def analyze_wyckoff_position_multiplicities_and_coordinates(filepath):\n    return {'wyckoff_multiplicity_dict': {'a': 1}, 'wyckoff_coordinates_dict': {'a': ['0', '0', '0']}}\n${'x = 0\n'.repeat(100000)}`);
  const registry = plan1HostToolRegistry(); const running = registry['plan1-native-read-wrapper'].execute({ input: { task_id: 'crystallographic-wyckoff-position-analysis', task_root: f.task_root, workspace: f.workspace, action: 'public_validation' }, context, signal: controller.signal });
  for (let attempt = 0; attempt < 100 && plan1ActiveChildCount(context) === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(plan1ActiveChildCount(context), 1, 'Python AST child must be active before cancellation');
  controller.abort(new Error('test cancellation'));
  const [result, cancelled] = await Promise.all([running, registry['plan1-native-read-wrapper'].cancel({ context })]);
  assert.equal(result.exit_code, 1); assert.match(result.diagnostic, /PLAN1_EXECUTION_CANCELLED/); assert.equal(plan1ActiveChildCount(context), 0);
  assert.equal(cancelled.termination_confirmed, true); assert.equal(cancelled.evidence[0].kind, 'no-child-process-after-settlement');
});

test('Plan 1 timeout receipt waits for cancellation settlement before claiming no child process', async t => {
  const f = await publicFixture(t, 'crystallographic-wyckoff-position-analysis'); const context = { run_id: 'timeout-run', node_id: 'crystal', attempt_id: 'attempt', workspace: f.workspace, permissions: { access: 'read_only', allowed_paths: [] } };
  await writeFile(join(f.workspace, 'solution.py'), `def analyze_wyckoff_position_multiplicities_and_coordinates(filepath):\n    return {'wyckoff_multiplicity_dict': {'a': 1}, 'wyckoff_coordinates_dict': {'a': ['0', '0', '0']}}\n${'x = 0\n'.repeat(100000)}`);
  const identity = plan1ToolIdentity('plan1-native-read-wrapper');
  const contract = { id: 'plan1-native-read-wrapper', identity, argv: ['plan1-native-read-wrapper'], input_schema: { type: 'object', properties: { task_id: { type: 'string' }, task_root: { type: 'string' }, workspace: { type: 'string' }, action: { type: 'string' } }, required: ['task_id', 'task_root', 'workspace', 'action'], additionalProperties: false }, output_schema: { type: 'object', properties: { public_status: { type: 'string' }, action: { type: 'string' }, artifacts: { type: 'array', items: { type: 'string' } } }, required: ['public_status', 'action', 'artifacts'], additionalProperties: false }, env_allow: [], permissions: { network: false, read_paths: [], write_paths: [] }, output_cap_bytes: 4096, deadline_ms: 1, idempotency: { mode: 'safe' } };
  const result = await new HostToolRunner({ registry: plan1HostToolRegistry(), env: {} }).execute(contract, { task_id: 'crystallographic-wyckoff-position-analysis', task_root: f.task_root, workspace: f.workspace, action: 'public_validation' }, context);
  assert.equal(result.receipt.status, 'timed_out'); assert.equal(result.receipt.reconciliation.evidence[0].kind, 'no-child-process-after-settlement'); assert.equal(plan1ActiveChildCount(context), 0);
});

test('Plan 1 public earthquake validation rejects malformed timestamps, types, and ranges', async t => {
  const f = await publicFixture(t, 'earthquake-plate-calculation'); const path = join(f.workspace, 'answer.json');
  const valid = { id: 'id', place: 'place', time: '2026-01-01T00:00:00Z', magnitude: 1, latitude: 2, longitude: 3, distance_km: 4.2 };
  for (const invalid of [{ ...valid, time: '2026-01-01 00:00:00' }, { ...valid, magnitude: '1' }, { ...valid, latitude: 91 }, { ...valid, distance_km: -1 }]) { await writeFile(path, JSON.stringify(invalid)); await rejected(f.invoke, 'PLAN1_PUBLIC'); }
});

test('Plan 1 write helper canonicalizes fractional UTC seconds before strict read-only validation', async t => {
  const f = await publicFixture(t, 'earthquake-plate-calculation'); const path = join(f.workspace, 'answer.json');
  const candidate = { id: 'id', place: 'place', time: '2024-02-09T20:06:31.660Z', magnitude: 5.88, latitude: 19.18, longitude: -155.49, distance_km: 3878.27 };
  await writeFile(path, JSON.stringify(candidate));
  assert.equal((await f.invoke('public_validation')).exit_code, 1, 'read-only validation must not mutate invalid output');
  const helper = await plan1HostToolRegistry()['plan1-native-write-wrapper'].execute({ input: { task_id: 'earthquake-plate-calculation', task_root: f.task_root, workspace: f.workspace, action: 'common_helper' } });
  assert.equal(helper.exit_code, 0); assert.deepEqual(helper.effects.changed_paths, ['answer.json']); assert.match(helper.diagnostic, /PLAN1_NORMALIZED/);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).time, '2024-02-09T20:06:31Z');
  assert.equal((await f.invoke('public_validation')).exit_code, 0);
});

test('Plan 1 public lake validation rejects nonnumeric, malformed, and out-of-range p-value rows', async t => {
  const f = await publicFixture(t, 'lake-warming-attribution'); await mkdir(join(f.workspace, 'output'));
  const trend = join(f.workspace, 'output', 'trend_result.csv'); const factor = join(f.workspace, 'output', 'dominant_factor.csv'); await writeFile(factor, 'variable,contribution\nHeat,50\n');
  for (const invalid of ['slope,p-value\nnot-a-number,0.5\n', 'slope,p-value\n1,1.2\n', 'slope,p-value\n1\n']) { await writeFile(trend, invalid); await rejected(f.invoke, 'PLAN1_'); }
});

async function mediaTools() {
  const extraDirectories = process.env.PLAN1_MEDIA_TEST_DIRECTORY ? [process.env.PLAN1_MEDIA_TEST_DIRECTORY] : [];
  const environment = await discoverRuntimeEnvironment({ executables: ['ffmpeg', 'ffprobe'] }, { extraDirectories });
  const paths = Object.fromEntries(environment.tools.map(tool => [tool.name, tool.path]));
  try { await execFile(paths.ffmpeg, ['-version'], { windowsHide: true }); await execFile(paths.ffprobe, ['-version'], { windowsHide: true }); }
  catch (error) { throw Object.assign(new Error(`Plan 1 video validator tests require ffmpeg and ffprobe: ${error.message}`), { code: 'PLAN1_MEDIA_TEST_REQUIREMENT' }); }
  return environment;
}
async function makeMedia(path, environment, kind = 'av') {
  const args = kind === 'audio'
    ? ['-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100', '-t', '1', '-c:a', 'aac', path]
    : kind === 'video'
      ? ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=25', '-t', '1', '-c:v', 'mpeg4', path]
      : ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=25', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100', '-t', '1', '-c:v', 'mpeg4', '-c:a', 'aac', path];
  const ffmpeg = environment.tools.find(tool => tool.name === 'ffmpeg')?.path;
  await execFile(ffmpeg, args, { windowsHide: true, maxBuffer: 8192 });
}

test('Plan 1 public video validation executes ffprobe and rejects invalid media, streams, durations, segments, and arithmetic', async t => {
  const environment = await mediaTools(); const context = { runtime_environment: environment };
  const f = await publicFixture(t, 'video-silence-remover'); const media = join(f.workspace, 'compressed_video.mp4'); const report = join(f.workspace, 'compression_report.json');
  const valid = { original_duration_seconds: 2, compressed_duration_seconds: 1, removed_duration_seconds: 1, compression_percentage: 50, segments_removed: [{ start: 0, end: 1, duration: 1 }] };
  const rejectMedia = expected => f.invoke('public_validation', context).then(result => { assert.equal(result.exit_code, 1); assert.match(result.diagnostic, new RegExp(expected)); });
  await writeFile(media, 'not-video'); await writeFile(report, JSON.stringify(valid)); await rejectMedia('PLAN1_MEDIA_INVALID');
  await writeFile(media, Buffer.from('0000ftypisom0000'));
  await rejectMedia('PLAN1_MEDIA_INVALID');
  await makeMedia(media, environment, 'audio'); await rejectMedia('PLAN1_MEDIA_INVALID');
  await makeMedia(media, environment, 'video'); await rejectMedia('PLAN1_MEDIA_INVALID');
  await makeMedia(media, environment); await writeFile(report, JSON.stringify(valid)); assert.equal((await f.invoke('public_validation', context)).exit_code, 0);
  for (const invalid of [{ ...valid, compressed_duration_seconds: 1.5, removed_duration_seconds: 0.5, compression_percentage: 25, segments_removed: [{ start: 0, end: 0.5, duration: 0.5 }] }, { ...valid, segments_removed: [{ start: 0, end: 1, duration: 0.8 }, { start: 1, end: 1.2, duration: 0.2 }] }, { ...valid, segments_removed: [{ start: 0, end: 1 }] }, { ...valid, segments_removed: [{ start: 0, end: 0.5, duration: 0.5 }, { start: 0.4, end: 1, duration: 0.6 }] }, { ...valid, compression_percentage: 40 }]) { await writeFile(report, JSON.stringify(invalid)); await rejectMedia('PLAN1_PUBLIC'); }
});

test('Plan 1 host identity is derived from implementation and public-contract content', () => {
  const actual = plan1ToolIdentity('plan1-native-read-wrapper');
  const expected = digest(canonicalJSON({ name: actual.name, version: actual.version, implementation_sha256: PLAN1_HOST_IMPLEMENTATION_SHA256, public_contract_sha256: PLAN1_PUBLIC_CONTRACT_SHA256, validation_dependencies_sha256: PLAN1_VALIDATION_DEPENDENCIES_SHA256 }));
  const changedImplementation = digest('changed implementation bytes');
  const changed = digest(canonicalJSON({ name: actual.name, version: actual.version, implementation_sha256: changedImplementation, public_contract_sha256: PLAN1_PUBLIC_CONTRACT_SHA256, validation_dependencies_sha256: PLAN1_VALIDATION_DEPENDENCIES_SHA256 }));
  assert.equal(actual.sha256, expected); assert.notEqual(actual.sha256, changed);
});
