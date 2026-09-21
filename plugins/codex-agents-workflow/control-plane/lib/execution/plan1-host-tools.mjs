import { readFileSync } from 'node:fs';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute, parse, relative, resolve, sep, join } from 'node:path';
import { promisify } from 'node:util';
import { canonicalJSON, digest } from '../workflow-revisions.mjs';
import { executeBoundProgram, qualifiedExecutionBinding } from './codex-tool-broker.mjs';

const VERSION = 'plan1-v3';
const execFile = promisify(execFileCallback);
const MEDIA_DURATION_TOLERANCE_SECONDS = 0.25;
const SEGMENT_DURATION_TOLERANCE_SECONDS = 0.1;
const PYTHON_AST_INSPECTION = String.raw`import ast,json,pathlib,sys
source=pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
tree=ast.parse(source)
entry=next((node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=="analyze_wyckoff_position_multiplicities_and_coordinates"),None)
if entry is None: raise ValueError("required entry function is missing")
class Returns(ast.NodeVisitor):
  def __init__(self): self.values=[]
  def visit_FunctionDef(self,node): return
  def visit_AsyncFunctionDef(self,node): return
  def visit_Lambda(self,node): return
  def visit_Return(self,node): self.values.append(node.value)
returns=Returns()
for statement in entry.body: returns.visit(statement)
def literal(value): return value.value if isinstance(value,ast.Constant) and isinstance(value.value,str) else None
def coordinate_tuple(value):
  if not isinstance(value,ast.Dict): return False
  for key,item in zip(value.keys,value.values):
    if literal(key)=="wyckoff_coordinates_dict" and isinstance(item,ast.Dict):
      if any(isinstance(coordinate,ast.Tuple) and len(coordinate.elts)==3 for coordinate in item.values): return True
  return False
def invalid_outer(value):
  if not isinstance(value,ast.Dict): return False
  keys={literal(key) for key in value.keys}
  return keys != {"wyckoff_multiplicity_dict","wyckoff_coordinates_dict"}
print(json.dumps({"entry_tuple":any(isinstance(value,ast.Tuple) for value in returns.values),"coordinate_tuple":any(coordinate_tuple(value) for value in returns.values),"outer_keys_invalid":any(invalid_outer(value) for value in returns.values)}))`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const expectedInputs = Object.freeze({
  'crystallographic-wyckoff-position-analysis': ['Al2O3_mp-7048.cif', 'C_mp-169.cif', 'C_mp-683919.cif', 'CF4_mp-1167.cif', 'FeS2_mp-1522.cif', 'FeS2_mp-226.cif', 'HgSe_mp-1018722.cif', 'SiO2_mp-12787.cif', 'SiO2_mp-542814.cif', 'SiO2_mp-6945.cif', 'SiO2_mp-7000.cif'].map(name => `environment/${name}`),
  'earthquake-plate-calculation': ['environment/earthquakes_2024.json', 'environment/PB2002_boundaries.json', 'environment/PB2002_plates.json'],
  'lake-warming-attribution': ['environment/data/water_temperature.csv', 'environment/data/climate.csv', 'environment/data/land_cover.csv', 'environment/data/hydrology.csv'],
  'video-silence-remover': ['environment/data/input_video.mp4'],
});
const expectedArtifacts = Object.freeze({
  'crystallographic-wyckoff-position-analysis': ['solution.py'],
  'earthquake-plate-calculation': ['answer.json'],
  'lake-warming-attribution': ['output/trend_result.csv', 'output/dominant_factor.csv'],
  'video-silence-remover': ['compressed_video.mp4', 'compression_report.json'],
});
// These are public task-output contracts, not an oracle or a hidden-verifier copy.
const publicContract = Object.freeze({
  crystal: { entry: 'analyze_wyckoff_position_multiplicities_and_coordinates', keys: ['wyckoff_multiplicity_dict', 'wyckoff_coordinates_dict'] },
  earthquake: { keys: ['id', 'place', 'time', 'magnitude', 'latitude', 'longitude', 'distance_km'] },
  lake: { trend: ['slope', 'p-value'], factor: ['variable', 'contribution'], variables: ['Heat', 'Flow', 'Wind', 'Human'] },
  video: { keys: ['original_duration_seconds', 'compressed_duration_seconds', 'removed_duration_seconds', 'compression_percentage', 'segments_removed'], segment: ['start', 'end', 'duration'] },
});
const validationDependencies = Object.freeze({ python: { executable: 'python', module: 'ast', operation: 'parse-utf8-source-v1' }, media: { executable: 'ffprobe', operation: 'decode-stream-duration-json-v1', signature: 'iso-base-media-ftyp-v1', duration_tolerance_seconds: MEDIA_DURATION_TOLERANCE_SECONDS } });
const implementationBytes = readFileSync(fileURLToPath(import.meta.url));
export const PLAN1_HOST_IMPLEMENTATION_SHA256 = digest(implementationBytes);
export const PLAN1_PUBLIC_CONTRACT_SHA256 = digest(canonicalJSON(publicContract));
export const PLAN1_VALIDATION_DEPENDENCIES_SHA256 = digest(canonicalJSON(validationDependencies));

export function plan1ToolIdentity(name) {
  return { name, version: VERSION, sha256: digest(canonicalJSON({ name, version: VERSION, implementation_sha256: PLAN1_HOST_IMPLEMENTATION_SHA256, public_contract_sha256: PLAN1_PUBLIC_CONTRACT_SHA256, validation_dependencies_sha256: PLAN1_VALIDATION_DEPENDENCIES_SHA256 })) };
}

function failure(code, message) { return Object.assign(new Error(message), { code }); }
function resolvedExecutable(context, name) {
  const tool = context?.runtime_environment?.tools?.find(item => item?.name === name);
  if (!tool) return name;
  if (tool.status !== 'found' || typeof tool.path !== 'string' || !isAbsolute(tool.path)) throw failure('PLAN1_RUNTIME_DEPENDENCY_UNRESOLVED', `Run-resolved executable is invalid: ${name}`);
  return tool.path;
}
const activeExecutions = new Map();
function executionKey(context = {}) { return canonicalJSON({ run_id: context.run_id ?? null, node_id: context.node_id ?? null, attempt_id: context.attempt_id ?? null }); }
function throwIfAborted(signal) { if (signal?.aborted) throw failure('PLAN1_EXECUTION_CANCELLED', 'Plan 1 public validation was cancelled before a child process started'); }
function beginExecution(context) {
  const key = executionKey(context); let resolveSettled;
  const active = { children: new Set(), settled: new Promise(resolve => { resolveSettled = resolve; }), settle: resolveSettled };
  if (activeExecutions.has(key)) throw failure('PLAN1_EXECUTION_DUPLICATE', 'Plan 1 validation already has an active exact execution');
  activeExecutions.set(key, active); return { key, active };
}
export function plan1ActiveChildCount(context = {}) { return activeExecutions.get(executionKey(context))?.children.size ?? 0; }
async function runChild(active, executable, args, { signal, maxBuffer = 8192 } = {}) {
  throwIfAborted(signal);
  return new Promise((resolveChild, rejectChild) => {
    let child; let abort;
    const done = (error, stdout, stderr) => {
      if (signal && abort) signal.removeEventListener('abort', abort);
      active.children.delete(child);
      if (signal?.aborted) rejectChild(failure('PLAN1_EXECUTION_CANCELLED', 'Plan 1 public validation child process was cancelled and settled'));
      else if (error) rejectChild(Object.assign(error, { stdout, stderr })); else resolveChild({ stdout, stderr });
    };
    child = execFileCallback(executable, args, { windowsHide: true, timeout: 10000, maxBuffer }, done);
    active.children.add(child);
    abort = () => { child.kill(); };
    if (signal) signal.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
function contained(root, candidate) { const path = relative(root, candidate); return path === '' || (!path.startsWith('..') && !isAbsolute(path)); }
async function noLinks(path) {
  const absolute = resolve(path); const root = parse(absolute).root; let current = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw failure('PLAN1_SYMLINK', `Plan 1 path contains a symbolic link: ${current}`);
  }
  return realpath(absolute);
}
async function directory(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw failure('PLAN1_PATH_REQUIRED', `Plan 1 ${label} must be absolute`);
  const canonical = await noLinks(path); const item = await lstat(canonical);
  if (!item.isDirectory()) throw failure('PLAN1_DIRECTORY_INVALID', `Required directory is invalid: ${label}`);
  return canonical;
}
async function taskPaths(input) {
  if (!expectedInputs[input.task_id]) throw failure('PLAN1_TASK_UNKNOWN', `Unknown Plan 1 task: ${input.task_id}`);
  return { taskRoot: await directory(input.task_root, 'task_root'), workspace: await directory(input.workspace, 'workspace') };
}
async function regularFile(root, path, { nonempty = false } = {}) {
  const target = resolve(root, path);
  if (!contained(root, target)) throw failure('PLAN1_PATH_ESCAPE', `Path escapes its root: ${path}`);
  const canonical = await noLinks(target); const item = await lstat(canonical);
  if (!item.isFile() || (nonempty && item.size === 0)) throw failure('PLAN1_FILE_INVALID', `Required regular file is invalid: ${path}`);
  return { path: path.replaceAll('\\', '/'), bytes: item.size, sha256: digest(await readFile(canonical)) };
}
function exactKeys(value, keys) { return object(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0'); }
function finite(value, field) { if (!Number.isFinite(value)) throw failure('PLAN1_PUBLIC_SCHEMA', `${field} must be a finite number`); return value; }
function ranged(value, field, low, high) { finite(value, field); if (value < low || value > high) throw failure('PLAN1_PUBLIC_RANGE', `${field} is outside its public range`); return value; }
function parseCsv(text, name) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) { if (char === '"') { if (text[i + 1] === '"') { field += char; i++; } else quoted = false; } else field += char; continue; }
    if (char === '"') { if (field.length) throw failure('PLAN1_CSV_MALFORMED', `${name} contains a misplaced quote`); quoted = true; }
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; } else field += char;
  }
  if (quoted) throw failure('PLAN1_CSV_MALFORMED', `${name} has an unterminated quoted field`);
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length || rows.some(item => !item.length || item.some(value => value.length === 0))) throw failure('PLAN1_CSV_MALFORMED', `${name} has an empty row or field`);
  return rows;
}
async function crystalPublicShape(path, active, signal, context) {
  let output;
  try { output = JSON.parse((await runChild(active, resolvedExecutable(context, 'python'), ['-c', PYTHON_AST_INSPECTION, path], { signal, maxBuffer: 4096 })).stdout); }
  catch (error) {
    if (error.code === 'PLAN1_EXECUTION_CANCELLED') throw error;
    throw failure('PLAN1_PYTHON_SYNTAX', `solution.py does not parse as Python: ${String(error.stderr ?? error.message).trim().slice(0, 512)}`);
  }
  if (!object(output) || typeof output.entry_tuple !== 'boolean' || typeof output.coordinate_tuple !== 'boolean' || typeof output.outer_keys_invalid !== 'boolean') throw failure('PLAN1_PUBLIC_SCHEMA', 'solution.py AST inspection returned an invalid public shape result');
  if (output.entry_tuple) throw failure('PLAN1_PUBLIC_SCHEMA', 'The required entry function returns a tuple instead of the public result object');
  if (output.outer_keys_invalid) throw failure('PLAN1_PUBLIC_SCHEMA', 'The required entry function returns a static object with invalid public outer keys');
  if (output.coordinate_tuple) throw failure('PLAN1_PUBLIC_SCHEMA', 'The required entry function uses a tuple literal where a public coordinate list is required');
}
function isoUtc(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || Number.isNaN(Date.parse(value))) throw failure('PLAN1_PUBLIC_SCHEMA', 'time must be a valid UTC ISO-8601 timestamp'); }
function validateEarthquake(answer, { allowFractionalTime = false } = {}) {
  if (!exactKeys(answer, publicContract.earthquake.keys) || typeof answer.id !== 'string' || !answer.id || typeof answer.place !== 'string' || !answer.place) throw failure('PLAN1_PUBLIC_SCHEMA', 'answer.json does not satisfy the public schema');
  if (allowFractionalTime && typeof answer.time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/.test(answer.time) && !Number.isNaN(Date.parse(answer.time))) {
    // The public task declares whole-second UTC.  Dropping only the fractional
    // component is a deterministic representation normalization, not a model
    // retry or a semantic-data repair.
  } else isoUtc(answer.time);
  ranged(answer.magnitude, 'magnitude', -2, 10); ranged(answer.latitude, 'latitude', -90, 90); ranged(answer.longitude, 'longitude', -180, 180); ranged(answer.distance_km, 'distance_km', 0, 20038);
  if (Math.abs(answer.distance_km * 100 - Math.round(answer.distance_km * 100)) > 1e-8) throw failure('PLAN1_PUBLIC_RANGE', 'distance_km must be rounded to two decimal places');
}
async function normalizePublicOutput(taskId, workspace) {
  if (taskId !== 'earthquake-plate-calculation') return [];
  const path = resolve(workspace, 'answer.json');
  const answer = JSON.parse(await readFile(path, 'utf8'));
  validateEarthquake(answer, { allowFractionalTime: true });
  const match = typeof answer.time === 'string' && answer.time.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+Z$/);
  if (!match) return [];
  const before = answer.time; answer.time = `${match[1]}Z`; isoUtc(answer.time);
  await writeFile(path, canonicalJSON(answer), 'utf8');
  return [{ path: 'answer.json', field: '/time', before, after: answer.time }];
}
function mp4(bytes) { return bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp'; }
async function probeMedia(path, active, signal, context, roots) {
  let result;
  try {
    const binding = qualifiedExecutionBinding(context?.execution_binding);
    if (binding) {
      result = await executeBoundProgram(binding, { program: 'ffprobe', args: ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', relative(roots.workspace, path).split(sep).join('/')], cwd: 'workspace' }, roots, { signal });
      if (result.exit_code !== 0) throw Object.assign(new Error(result.stderr || result.output || `ffprobe exited ${result.exit_code}`), { code: 'PLAN1_MEDIA_PROBE_FAILED', stderr: result.stderr });
    } else result = await runChild(active, resolvedExecutable(context, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path], { signal });
  }
  catch (error) {
    if (['PLAN1_EXECUTION_CANCELLED', 'CODEX_EXECUTION_CANCELLED'].includes(error.code)) throw failure('PLAN1_EXECUTION_CANCELLED', 'Plan 1 public validation was cancelled while ffprobe was running');
    if (error.code === 'ENOENT') throw failure('PLAN1_FFPROBE_UNAVAILABLE', 'ffprobe is required for public video validation but is unavailable');
    throw failure('PLAN1_MEDIA_INVALID', `compressed_video.mp4 is not ffprobe-decodable: ${String(error.stderr ?? error.message).trim().slice(0, 512)}`);
  }
  let probe;
  try { probe = JSON.parse(result.stdout); }
  catch { throw failure('PLAN1_MEDIA_INVALID', 'ffprobe returned malformed media metadata'); }
  const duration = Number(probe?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(probe.streams) || !probe.streams.some(stream => stream?.codec_type === 'video') || !probe.streams.some(stream => stream?.codec_type === 'audio')) throw failure('PLAN1_MEDIA_INVALID', 'compressed_video.mp4 must decode with at least one video and one audio stream');
  return duration;
}
async function publicCheck(taskId, workspace, active, signal, context, taskRoot) {
  const artifacts = await Promise.all(expectedArtifacts[taskId].map(path => regularFile(workspace, path, { nonempty: true })));
  if (taskId === 'crystallographic-wyckoff-position-analysis') {
    const path = resolve(workspace, 'solution.py'); await readFile(path, 'utf8'); throwIfAborted(signal);
    await crystalPublicShape(path, active, signal, context);
  } else if (taskId === 'earthquake-plate-calculation') {
    const answer = JSON.parse(await readFile(resolve(workspace, 'answer.json'), 'utf8'));
    validateEarthquake(answer);
  } else if (taskId === 'lake-warming-attribution') {
    const trend = parseCsv(await readFile(resolve(workspace, 'output/trend_result.csv'), 'utf8'), 'trend_result.csv'); const factor = parseCsv(await readFile(resolve(workspace, 'output/dominant_factor.csv'), 'utf8'), 'dominant_factor.csv');
    if (trend.length !== 2 || trend[0].join(',') !== publicContract.lake.trend.join(',') || trend.some(row => row.length !== 2)) throw failure('PLAN1_PUBLIC_SCHEMA', 'trend_result.csv does not satisfy the public CSV schema');
    if (factor.length !== 2 || factor[0].join(',') !== publicContract.lake.factor.join(',') || factor.some(row => row.length !== 2)) throw failure('PLAN1_PUBLIC_SCHEMA', 'dominant_factor.csv does not satisfy the public CSV schema');
    finite(Number(trend[1][0]), 'slope'); ranged(Number(trend[1][1]), 'p-value', 0, 1); if (!publicContract.lake.variables.includes(factor[1][0])) throw failure('PLAN1_PUBLIC_SCHEMA', 'dominant factor must be one public category'); ranged(Number(factor[1][1]), 'contribution', 0, 100);
  } else {
    const mediaPath = resolve(workspace, 'compressed_video.mp4'); const media = await readFile(mediaPath); if (!mp4(media)) throw failure('PLAN1_MEDIA_INVALID', 'compressed_video.mp4 lacks a public ISO base-media signature');
    const measuredDuration = await probeMedia(mediaPath, active, signal, context, { workspace, task_root: taskRoot });
    const report = JSON.parse(await readFile(resolve(workspace, 'compression_report.json'), 'utf8'));
    if (!exactKeys(report, publicContract.video.keys) || !Array.isArray(report.segments_removed)) throw failure('PLAN1_PUBLIC_SCHEMA', 'compression_report.json does not satisfy the public schema');
    const original = ranged(report.original_duration_seconds, 'original_duration_seconds', Number.EPSILON, 24 * 60 * 60); const compressed = ranged(report.compressed_duration_seconds, 'compressed_duration_seconds', 0, original); const removed = ranged(report.removed_duration_seconds, 'removed_duration_seconds', 0, original); const percentage = ranged(report.compression_percentage, 'compression_percentage', 0, 100);
    if (Math.abs(original - compressed - removed) > MEDIA_DURATION_TOLERANCE_SECONDS || Math.abs(percentage - removed / original * 100) > SEGMENT_DURATION_TOLERANCE_SECONDS) throw failure('PLAN1_PUBLIC_ARITHMETIC', 'Video report duration or percentage arithmetic is inconsistent');
    if (Math.abs(measuredDuration - compressed) > MEDIA_DURATION_TOLERANCE_SECONDS) throw failure('PLAN1_PUBLIC_ARITHMETIC', 'Video report compressed duration differs from ffprobe media duration');
    let previousEnd = 0;
    let segmentDurationTotal = 0;
    for (const [index, segment] of report.segments_removed.entries()) {
      if (!exactKeys(segment, publicContract.video.segment)) throw failure('PLAN1_PUBLIC_SCHEMA', `segments_removed[${index}] has invalid fields`);
      const start = ranged(segment.start, `segments_removed[${index}].start`, 0, original); const end = ranged(segment.end, `segments_removed[${index}].end`, 0, original); const duration = ranged(segment.duration, `segments_removed[${index}].duration`, 0, original);
      if (end <= start || start < previousEnd || Math.abs(end - start - duration) > SEGMENT_DURATION_TOLERANCE_SECONDS) throw failure('PLAN1_PUBLIC_ARITHMETIC', `segments_removed[${index}] is malformed or overlaps a prior segment`);
      previousEnd = end; segmentDurationTotal += duration;
    }
    if (Math.abs(segmentDurationTotal - removed) > SEGMENT_DURATION_TOLERANCE_SECONDS) throw failure('PLAN1_PUBLIC_ARITHMETIC', 'segments_removed duration total differs from removed_duration_seconds');
  }
  return artifacts;
}

async function execute({ input, context = {}, signal }) {
  const execution = beginExecution(context);
  try {
    throwIfAborted(signal); const { taskRoot, workspace } = await taskPaths(input); throwIfAborted(signal); let artifacts; let normalizations = [];
    if (input.action === 'input_preflight') artifacts = await Promise.all(expectedInputs[input.task_id].map(path => regularFile(taskRoot, path, { nonempty: true })));
    else if (input.action === 'common_helper') { normalizations = await normalizePublicOutput(input.task_id, workspace); artifacts = await publicCheck(input.task_id, workspace, execution.active, signal, context, taskRoot); }
    else if (input.action === 'public_validation') artifacts = await publicCheck(input.task_id, workspace, execution.active, signal, context, taskRoot);
    else throw failure('PLAN1_ACTION_UNSUPPORTED', `Unsupported Plan 1 public action: ${input.action}`);
    const validationLevel = input.action === 'input_preflight' ? 'input_integrity' : 'public_structural';
    const normalizationDiagnostic = normalizations.length ? `; PLAN1_NORMALIZED: ${normalizations.map(item => `${item.path}#${item.field} ${item.before} -> ${item.after}`).join(', ')}` : '';
    return { exit_code: 0, output: { public_status: input.action === 'input_preflight' ? 'ready' : 'passed', action: input.action, artifacts: artifacts.map(item => item.path) }, diagnostic: `PLAN1_VALIDATION_LEVEL: ${validationLevel}${normalizationDiagnostic}`, effects: { observed: true, changed_paths: normalizations.map(item => item.path), outside_paths: [], artifacts: artifacts.map(item => ({ id: digest(`${input.task_id}\0${item.path}`), sha256: item.sha256, bytes: item.bytes })) } };
  } catch (error) { return { exit_code: 1, output: null, diagnostic: `${error.code ?? 'PLAN1_PUBLIC_CHECK_FAILED'}: ${error.message}`, effects: { observed: true, changed_paths: [], outside_paths: [], artifacts: [] } }; }
  finally { execution.active.settle(); activeExecutions.delete(execution.key); }
}
async function cancel({ context = {} } = {}) {
  const key = executionKey(context); const active = activeExecutions.get(key);
  if (active) await active.settled;
  return { termination_confirmed: true, evidence: [{ kind: 'no-child-process-after-settlement', sha256: digest(canonicalJSON({ broker: 'plan1-public-contract-checks', version: VERSION, execution: JSON.parse(key), active_children: active?.children.size ?? 0, settled: true })) }], effects: { observed: true, changed_paths: [], outside_paths: [], artifacts: [] } };
}
export function plan1HostToolRegistry() {
  const broker_id = 'plan1-public-contract-checks'; const evidence_sha256 = digest(canonicalJSON({ broker_id, version: VERSION, implementation_sha256: PLAN1_HOST_IMPLEMENTATION_SHA256, public_contract_sha256: PLAN1_PUBLIC_CONTRACT_SHA256, validation_dependencies_sha256: PLAN1_VALIDATION_DEPENDENCIES_SHA256, network: false, subprocesses: ['python-ast-parse'] }));
  const entry = name => ({ identity: plan1ToolIdentity(name), attestation: { qualified: true, cancellable: true, effect_observation: true, tool_identity: plan1ToolIdentity(name), broker_id, evidence_sha256 }, execute, cancel });
  return { 'plan1-native-read-wrapper': entry('plan1-native-read-wrapper'), 'plan1-native-write-wrapper': entry('plan1-native-write-wrapper') };
}
export const PLAN1_HOST_TOOL_VERSION = VERSION;
