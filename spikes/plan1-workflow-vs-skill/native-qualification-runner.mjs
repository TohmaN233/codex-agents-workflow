import { access, stat, lstat, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, join, dirname, isAbsolute, win32 } from 'node:path';
import { spawn } from 'node:child_process';
import { canonicalJSON, digest } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';
import { PLAN1_TASK_IDS, validatePlan1Manifests } from './harness.mjs';
import { buildNativeToolchainManifest } from './plan1-fixture-compiler.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), { code }); };
const ACTIONS = Object.freeze(['oracle', 'counterexample', 'helper']);
const JUDGE_ACTIONS = new Set(['oracle', 'counterexample']);
const ACTION_LAYOUT = Object.freeze({
  oracle: { outcome: 'oracle_pass', artifact: 'artifacts/oracle-product.json', evidence: 'evidence/oracle-verdict.json', kind: 'oracle_verdict', verdict: 'passed' },
  counterexample: { outcome: 'counterexample_rejected', artifact: 'artifacts/counterexample-product.json', evidence: 'evidence/counterexample-rejection.json', kind: 'verifier_rejection', verdict: 'rejected' },
  helper: { outcome: 'helper_pass', artifact: 'artifacts/helper-product.json', evidence: 'evidence/helper-receipt.json', kind: 'helper_receipt', verdict: 'passed' },
});
const bannedToken = /(^|[\\/\s:=_-])(docker|dockerd|containerd|podman|bench|codex|--agent|agent=|openai|model)(?:$|[\\/\s:=_-])/i;

function contained(root, candidate) { const rel = relative(root, candidate); return rel === '' || (!rel.startsWith('..') && !rel.includes(':')); }
const sha = value => /^[a-f0-9]{64}$/.test(value);
const systemWsl = value => typeof value === 'string' && win32.isAbsolute(value) && win32.basename(value).toLowerCase() === 'wsl.exe' && win32.dirname(value).replace(/\/+$/, '').toLowerCase().endsWith('\\windows\\system32');
function identity(value, field, { hostPath = false } = {}) {
  requireValue(object(value) && typeof value.path === 'string' && value.path.length > 0 && sha(value.sha256) && Object.keys(value).every(key => ['path', 'host_path', 'sha256'].includes(key)) && (!hostPath || typeof value.host_path === 'string' && isAbsolute(value.host_path)), 'PLAN1_QUALIFICATION_IDENTITY', `${field} needs an exact path and byte identity`);
  return structuredClone(value);
}
function wslIsolation(raw, platform, action) {
  requireValue(object(raw.wsl_isolation) && Object.keys(raw.wsl_isolation).every(key => ['bwrap', 'argv'].includes(key)), 'PLAN1_WSL_ISOLATION_REQUIRED', `${action} needs a bounded WSL bwrap isolation contract`);
  const bwrap = identity(raw.wsl_isolation.bwrap, `${action} bwrap`);
  requireValue(bwrap.path === '/usr/bin/bwrap' && Array.isArray(raw.wsl_isolation.argv) && raw.wsl_isolation.argv.length >= 2 && raw.wsl_isolation.argv.length <= 32 && raw.wsl_isolation.argv.every(value => typeof value === 'string' && value.length > 0 && value.length <= 1024) && raw.wsl_isolation.argv.includes('--unshare-net'), 'PLAN1_WSL_ISOLATION_REQUIRED', `${action} must pin /usr/bin/bwrap --unshare-net`);
  const prefix = [platform.launcher.executable, '-d', 'Ubuntu', '--', bwrap.path, ...raw.wsl_isolation.argv];
  requireValue(prefix.every((value, index) => raw.argv[index] === value), 'PLAN1_WSL_ISOLATION_REQUIRED', `${action} argv must execute the pinned bwrap --unshare-net prefix through wsl.exe -d Ubuntu`);
  return { bwrap, argv: [...raw.wsl_isolation.argv] };
}

function wslMountPath(hostPath) {
  const normalized = win32.normalize(hostPath);
  requireValue(win32.isAbsolute(normalized) && /^[A-Za-z]:\\/.test(normalized), 'PLAN1_WSL_ISOLATION_REQUIRED', 'WSL mounts require an absolute drive-qualified Windows path');
  return `/mnt/${normalized.slice(0, 1).toLowerCase()}/${normalized.slice(3).split('\\').join('/')}`;
}

function bindWslIsolation(command, sourceRoot, actionRoot, action) {
  if (!command.wsl_isolation) return command;
  const relativeScript = relative(sourceRoot, command.script.host_path);
  requireValue(relativeScript && contained(sourceRoot, command.script.host_path), 'PLAN1_WSL_ISOLATION_REQUIRED', `${action} script must be read from the frozen source mount`);
  const sourceMount = wslMountPath(sourceRoot); const actionMount = wslMountPath(actionRoot);
  const expected = ['--unshare-net', '--die-with-parent', '--ro-bind', sourceMount, '/source', '--bind', actionMount, '/work', '--tmpfs', '/tmp', '--proc', '/proc', '--dev', '/dev', '--chdir', '/work', '--'];
  requireValue(canonicalJSON(command.wsl_isolation.argv) === canonicalJSON(expected), 'PLAN1_WSL_ISOLATION_REQUIRED', `${action} must use the exact network-isolated source/read-only and action/write bwrap mount policy`);
  const scriptPath = `/source/${relativeScript.split('\\').join('/')}`;
  requireValue(command.script.path === scriptPath && command.argv.includes(scriptPath), 'PLAN1_WSL_ISOLATION_REQUIRED', `${action} must execute its pinned script from the read-only /source mount`);
  const prefix = [command.executable.path, '-d', 'Ubuntu', '--', command.wsl_isolation.bwrap.path, ...expected];
  requireValue(prefix.every((value, index) => command.argv[index] === value) && command.argv.slice(prefix.length).every(value => !value.startsWith('/mnt/')), 'PLAN1_WSL_ISOLATION_REQUIRED', `${action} cannot bypass bwrap through an unmounted host path`);
  return { ...command, wsl_isolation: { ...command.wsl_isolation, source_mount: sourceMount, action_mount: actionMount } };
}
function commandDescriptor(raw, action, role, platform) {
  requireValue(object(raw) && Array.isArray(raw.argv) && raw.argv.length > 0 && raw.argv.length <= 32 && raw.argv.every(value => typeof value === 'string' && value.length > 0 && value.length <= 4096), 'PLAN1_QUALIFICATION_COMMAND', `${action} needs a bounded argv array`);
  requireValue(raw.shell !== true && raw.paid_dispatch !== true && raw.agent_arm === undefined && raw.network === false, 'PLAN1_PAID_DISPATCH_FORBIDDEN', 'Qualification commands cannot use a shell, network, paid dispatch, or an Agent arm');
  requireValue(raw.argv.every(value => !bannedToken.test(value)), 'PLAN1_DOCKER_OR_MODEL_FORBIDDEN', 'Qualification commands cannot invoke Docker or a model/agent tool');
  requireValue(['judge', 'public'].includes(raw.visibility) && (JUDGE_ACTIONS.has(action) ? raw.visibility === 'judge' : raw.visibility === 'public'), 'PLAN1_VISIBILITY', `${action} needs its fixed qualification visibility`);
  requireValue(Number.isInteger(raw.deadline_ms) && raw.deadline_ms > 0 && raw.deadline_ms <= 300000, 'PLAN1_QUALIFICATION_COMMAND', `${action} needs a bounded deadline`);
  const executable = identity(raw.executable, `${action} ${role} executable`); const script = identity(raw.script, `${action} ${role} script`, { hostPath: platform.kind === 'wsl' });
  if (platform.kind === 'wsl') {
    requireValue(systemWsl(platform.launcher?.executable) && executable.path === platform.launcher.executable && raw.argv[0] === platform.launcher.executable && raw.argv[1] === '-d' && raw.argv[2] === 'Ubuntu' && raw.argv[3] === '--' && raw.argv.includes(script.path), 'PLAN1_WSL_LAUNCHER_REQUIRED', 'Linux qualification commands must explicitly begin with the exact System32 wsl.exe -d Ubuntu launcher');
    return { argv: [...raw.argv], visibility: raw.visibility, deadline_ms: raw.deadline_ms, network: false, env_allow: [...new Set(raw.env_allow ?? [])], executable, script, wsl_isolation: wslIsolation(raw, platform, action) };
  }
  requireValue(raw.argv[0] === executable.path && raw.argv.includes(script.path), 'PLAN1_QUALIFICATION_IDENTITY', `${action} argv must invoke its pinned executable and script paths`);
  return { argv: [...raw.argv], visibility: raw.visibility, deadline_ms: raw.deadline_ms, network: false, env_allow: [...new Set(raw.env_allow ?? [])], executable, script };
}

function commandMap(config, taskId, platform) {
  const raw = config.commands?.[taskId]; requireValue(object(raw), 'PLAN1_QUALIFICATION_COMMAND', `Missing qualification commands for ${taskId}`);
  return Object.fromEntries(ACTIONS.map(action => {
    const pair = raw[action]; const allowed = action === 'counterexample' ? ['producer', 'verifier', 'rejection_exit_code'] : ['producer', 'verifier'];
    requireValue(object(pair) && Object.keys(pair).every(key => allowed.includes(key)) && pair.producer && pair.verifier, 'PLAN1_QUALIFICATION_COMMAND', `${action} requires separate pinned producer and verifier commands`);
    if (action === 'counterexample') requireValue(Number.isInteger(pair.rejection_exit_code) && pair.rejection_exit_code >= 1 && pair.rejection_exit_code <= 255, 'PLAN1_QUALIFICATION_COMMAND', 'Counterexample requires one explicit nonzero verifier rejection exit code');
    const producer = commandDescriptor(pair.producer, action, 'producer', platform); const verifier = commandDescriptor(pair.verifier, action, 'verifier', platform);
    requireValue(producer.visibility === verifier.visibility && canonicalJSON(producer.argv) !== canonicalJSON(verifier.argv), 'PLAN1_QUALIFICATION_COMMAND', `${action} producer and verifier must be distinct commands with identical visibility`);
    return [action, { visibility: producer.visibility, producer, verifier, ...(action === 'counterexample' ? { rejection_exit_code: pair.rejection_exit_code } : {}) }];
  }));
}

async function present(sourceRoot, path) {
  const absolute = resolve(sourceRoot, path); requireValue(contained(sourceRoot, absolute), 'PLAN1_SOURCE_PATH', `Declared source path escapes source root: ${path}`);
  try { await access(absolute); const item = await stat(absolute); return { path, exists: true, kind: item.isDirectory() ? 'directory' : 'file' }; }
  catch { return { path, exists: false, kind: null }; }
}
async function pinnedFile(identity, sourceRoot, { insideSource = false } = {}) {
  const hostPath = resolve(identity.host_path ?? identity.path); if (insideSource) requireValue(contained(sourceRoot, hostPath), 'PLAN1_QUALIFICATION_IDENTITY', 'Qualification script must stay inside the frozen source root');
  const item = await lstat(hostPath); requireValue(item.isFile() && !item.isSymbolicLink(), 'PLAN1_QUALIFICATION_IDENTITY', `Pinned qualification path must be a regular file: ${identity.path}`);
  const bytes = await readFile(hostPath); requireValue(digest(bytes) === identity.sha256, 'PLAN1_QUALIFICATION_IDENTITY', `Pinned qualification bytes differ: ${identity.path}`); return { ...identity, ...(identity.host_path ? { host_path: hostPath } : { path: hostPath }), sha256: identity.sha256, bytes: bytes.length };
}
async function pinCommand(command, sourceRoot) { return { ...command, executable: await pinnedFile(command.executable, sourceRoot), script: await pinnedFile(command.script, sourceRoot, { insideSource: true }) }; }
function sourceScriptPath(sourceRoot, sourcePath, platform) {
  const absolute = resolve(sourceRoot, sourcePath);
  return platform.kind === 'wsl' ? `/source/${relative(sourceRoot, absolute).split('\\').join('/')}` : absolute;
}
function verifyVerifierBinding(verifier, producer, task, sourceRoot, platform, action) {
  const expectedHost = resolve(sourceRoot, task.verifier_path); const verifierHost = resolve(verifier.script.host_path ?? verifier.script.path);
  requireValue(verifierHost === expectedHost && verifier.script.path === sourceScriptPath(sourceRoot, task.verifier_path, platform), 'PLAN1_VERIFIER_BINDING', `${action} verifier must execute the frozen source-manifest verifier path`);
  requireValue(resolve(producer.script.host_path ?? producer.script.path) !== verifierHost, 'PLAN1_VERIFIER_BINDING', `${action} producer cannot double as its independent verifier`);
}
async function pinnedEvidence(root, entry, label, { expectedPath } = {}) {
  requireValue(object(entry) && typeof entry.path === 'string' && entry.path.length > 0 && sha(entry.sha256) && Object.keys(entry).every(key => ['path', 'sha256'].includes(key)), 'PLAN1_QUALIFICATION_EVIDENCE', `${label} needs a bounded path and hash`);
  requireValue(expectedPath === undefined || entry.path === expectedPath, 'PLAN1_QUALIFICATION_EVIDENCE', `${label} path differs from the frozen declaration`);
  const path = resolve(root, entry.path); requireValue(contained(root, path), 'PLAN1_QUALIFICATION_EVIDENCE', `${label} path escapes its permitted root`);
  const item = await lstat(path); requireValue(item.isFile() && !item.isSymbolicLink(), 'PLAN1_QUALIFICATION_EVIDENCE', `${label} must be a regular in-root file`);
  const bytes = await readFile(path); requireValue(digest(bytes) === entry.sha256, 'PLAN1_QUALIFICATION_EVIDENCE', `${label} hash differs from the actual file`);
  return { path: entry.path, sha256: entry.sha256, bytes: bytes.length };
}
async function sourceEvidence(sourceRoot, task) {
  const input_files = await Promise.all(task.input_paths.map(async path => pinnedEvidence(sourceRoot, { path, sha256: digest(await readFile(resolve(sourceRoot, path))) }, 'input', { expectedPath: path })));
  const verifier = await pinnedEvidence(sourceRoot, { path: task.verifier_path, sha256: digest(await readFile(resolve(sourceRoot, task.verifier_path))) }, 'verifier', { expectedPath: task.verifier_path });
  return { input_files, verifier };
}
function taskRunRoot(config, taskId) {
  const raw = config.task_run_roots?.[taskId]; requireValue(typeof raw === 'string' && isAbsolute(raw), 'PLAN1_TASK_RUN_ROOT', `Task ${taskId} needs an absolute native run root`); return resolve(raw);
}
function actionRunRoot(taskRoot, action) {
  requireValue(ACTIONS.includes(action), 'PLAN1_QUALIFICATION_COMMAND', 'Unknown qualification action');
  const root = resolve(taskRoot, '.plan1-action-runs', action); requireValue(contained(taskRoot, root), 'PLAN1_TASK_RUN_ROOT', 'Action run root escaped its task root'); return root;
}
async function freshActionRoot(root) {
  await mkdir(dirname(root), { recursive: true });
  try { await mkdir(root); }
  catch (error) { if (error?.code === 'EEXIST') requireValue(false, 'PLAN1_ACTION_ROOT_REUSED', `Qualification action root already exists and cannot be reused: ${root}`); throw error; }
  const entries = await readdir(root); requireValue(entries.length === 0, 'PLAN1_ACTION_ROOT_DIRTY', `Qualification action root is not empty: ${root}`);
  return root;
}
async function filesUnder(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true }); const files = [];
  for (const entry of entries) {
    const path = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...await filesUnder(root, path));
    else { requireValue(entry.isFile() && !entry.isSymbolicLink(), 'PLAN1_QUALIFICATION_EVIDENCE', `Action output contains a non-regular file: ${path}`); files.push(path.split('\\').join('/')); }
  }
  return files.sort();
}

/**
 * Read-only native qualification planning. It inspects declared source paths
 * and validates command/visibility contracts, but cannot launch an Agent arm.
 */
export async function prepareNativeQualification(manifests, config) {
  validatePlan1Manifests(manifests);
  requireValue(object(config) && config.comparison_launch === false && (!config.agent_arms || config.agent_arms.length === 0), 'PLAN1_PAID_DISPATCH_FORBIDDEN', 'Native qualification preparation cannot launch any comparison arm');
  const toolchain = buildNativeToolchainManifest({ platform: config.platform, wrapper_contract: config.wrapper_contract });
  requireValue(typeof config.source_root === 'string' && config.source_root.length > 0, 'PLAN1_SOURCE_ROOT_REQUIRED', 'A local frozen source root is required for qualification');
  const sourceRoot = resolve(config.source_root); const tasks = manifests['source_manifest.json'].tasks;
  const planned = [];
  for (const task of tasks) {
    const paths = await Promise.all([task.task_root, ...task.input_paths ?? [], ...task.existing_code_paths ?? [], task.verifier_path, task.reference_solution_path].map(path => present(sourceRoot, path)));
    const run_root = taskRunRoot(config, task.task_id); const run = await present(run_root, '.');
    const action_run_roots = Object.fromEntries(ACTIONS.map(action => [action, actionRunRoot(run_root, action)]));
    const actionsAreFresh = await Promise.all(ACTIONS.map(async action => !(await present(action_run_roots[action], '.')).exists));
    const commands = Object.fromEntries(await Promise.all(Object.entries(commandMap(config, task.task_id, toolchain.platform)).map(async ([action, pair]) => {
      const producer = bindWslIsolation(await pinCommand(pair.producer, sourceRoot), sourceRoot, action_run_roots[action], action);
      const verifier = bindWslIsolation(await pinCommand(pair.verifier, sourceRoot), sourceRoot, action_run_roots[action], action);
      verifyVerifierBinding(verifier, producer, task, sourceRoot, toolchain.platform, action);
      return [action, { ...pair, producer, verifier }];
    })));
    planned.push({ task_id: task.task_id, source_paths: paths, run_root, action_run_roots, source_evidence: await sourceEvidence(sourceRoot, task), commands, ready_to_execute: paths.every(path => path.exists) && run.exists && run.kind === 'directory' && actionsAreFresh.every(Boolean) });
  }
  requireValue(new Set(planned.map(task => task.run_root)).size === planned.length, 'PLAN1_TASK_RUN_ROOT', 'Each fixed task needs a distinct native run root');
  return { schema: 'plan1-native-qualification-plan-v1', status: 'NOT_RUN', mode: 'DRY_RUN', comparison_status: 'NOT_RUN', plan2_status: 'LOCKED', source_root: sourceRoot, toolchain, tasks: planned, plan_sha256: digest(canonicalJSON({ toolchain, tasks: planned.map(task => ({ task_id: task.task_id, source_paths: task.source_paths, run_root: task.run_root, action_run_roots: task.action_run_roots, source_evidence: task.source_evidence, commands: task.commands })) })) };
}

function runCommand(command, { cwd, env = process.env, spawnImpl = spawn } = {}) {
  return new Promise((resolveRun, reject) => {
    const environment = Object.fromEntries(command.env_allow.filter(name => Object.hasOwn(env, name)).map(name => [name, env[name]])); let settled = false; let terminating = false; let terminationTimer = null;
    const child = spawnImpl(command.argv[0], command.argv.slice(1), { cwd, env: environment, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); let stdout = '';
    const finish = result => { if (!settled) { settled = true; clearTimeout(timer); if (terminationTimer) clearTimeout(terminationTimer); resolveRun(result); } };
    const unconfirmed = () => { if (!settled) { settled = true; clearTimeout(timer); if (terminationTimer) clearTimeout(terminationTimer); const error = Object.assign(new Error('Timed-out command lacks an exact process-tree termination receipt'), { code: 'TERMINATION_UNCONFIRMED' }); reject(error); } };
    const requestTermination = () => {
      if (settled || terminating) return; terminating = true;
      try { child.kill(); } catch { /* close confirmation below remains mandatory */ }
      terminationTimer = setTimeout(unconfirmed, Math.min(5000, Math.max(250, Math.ceil(command.deadline_ms / 10))));
    };
    child.stdout?.on('data', value => { stdout += value; if (Buffer.byteLength(stdout) > 32768) requestTermination(); });
    const timer = setTimeout(requestTermination, command.deadline_ms);
    child.once('error', error => { if (!settled) { if (terminating) unconfirmed(); else { settled = true; clearTimeout(timer); reject(Object.assign(error, { code: error.code ?? 'PLAN1_NATIVE_COMMAND_FAILED' })); } } });
    // A closed Windows launcher does not prove that its exact WSL/bwrap
    // descendants are dead. Until a qualified broker supplies that receipt,
    // every outer-deadline termination aborts qualification fail-closed.
    child.once('close', exitCode => { if (terminating) unconfirmed(); else finish({ status: exitCode === 0 ? 'succeeded' : 'failed', exit_code: exitCode, stdout }); });
  });
}
async function verifyWslIsolation(command, { cwd, env, spawnImpl } = {}) {
  if (!command.wsl_isolation) return null;
  const probe = { argv: [command.executable.path, '-d', 'Ubuntu', '--', 'sha256sum', command.wsl_isolation.bwrap.path], env_allow: command.env_allow, deadline_ms: command.deadline_ms };
  const result = await runCommand(probe, { cwd, env, spawnImpl });
  requireValue(result.status === 'succeeded' && typeof result.stdout === 'string', 'PLAN1_WSL_ISOLATION_REQUIRED', 'WSL could not attest the pinned bwrap executable');
  const observed = result.stdout.trim().split(/\s+/)[0]; requireValue(observed === command.wsl_isolation.bwrap.sha256, 'PLAN1_WSL_ISOLATION_REQUIRED', 'WSL bwrap bytes differ from the pinned isolation identity');
  return { ...command.wsl_isolation, observed_sha256: observed };
}
const commandReceipt = (command, result) => ({ argv_sha256: digest(canonicalJSON(command.argv)), executable: command.executable, script: command.script, status: result.status, exit_code: result.exit_code ?? null, ...(command.wsl_isolation ? { wsl_isolation: command.wsl_isolation } : {}) });
function verifierPassed(action, pair, result) {
  return action === 'counterexample'
    ? result.status === 'failed' && result.exit_code === pair.rejection_exit_code
    : result.status === 'succeeded' && result.exit_code === 0;
}
async function runnerOwnedEvidence(action, pair, task, artifact, verifier, verifierResult) {
  const layout = ACTION_LAYOUT[action];
  const document = { schema: 'plan1-runner-evidence-v2', action, outcome: layout.outcome, verifier_exit_code: verifierResult.exit_code, artifact_sha256: artifact.sha256, verifier_sha256: verifier.sha256, producer_argv_sha256: digest(canonicalJSON(pair.producer.argv)), verifier_argv_sha256: digest(canonicalJSON(pair.verifier.argv)), ...(action === 'counterexample' ? { rejection_exit_code: pair.rejection_exit_code } : {}) };
  const path = resolve(task.action_run_root, layout.evidence); await mkdir(dirname(path), { recursive: true }); await writeFile(path, canonicalJSON(document));
  const evidence = await pinnedEvidence(task.action_run_root, { path: layout.evidence, sha256: digest(await readFile(path)) }, `${action} runner evidence`, { expectedPath: layout.evidence });
  return { path: evidence.path, sha256: evidence.sha256, bytes: evidence.bytes, root: 'action_run_root', document };
}
async function qualificationReceipt(action, pair, producerResult, verifierResult, task) {
  const producer = commandReceipt(pair.producer, producerResult); const verifierCommand = commandReceipt(pair.verifier, verifierResult);
  if (producerResult.status !== 'succeeded') return { action, visibility: pair.visibility, status: producerResult.status, producer, verifier: null, evidence: null };
  const layout = ACTION_LAYOUT[action]; const artifact = await pinnedEvidence(task.action_run_root, { path: layout.artifact, sha256: digest(await readFile(resolve(task.action_run_root, layout.artifact))) }, 'artifact', { expectedPath: layout.artifact });
  requireValue(artifact.bytes > 0, 'PLAN1_QUALIFICATION_EVIDENCE', `${action} producer did not write the fixed fresh artifact manifest`);
  if (!verifierPassed(action, pair, verifierResult)) return { action, visibility: pair.visibility, status: verifierResult.status === 'timed_out' ? 'timed_out' : 'failed', producer, verifier: verifierCommand, evidence: null };
  const action_evidence = await runnerOwnedEvidence(action, pair, task, artifact, task.source_evidence.verifier, verifierResult);
  const files = await filesUnder(task.action_run_root);
  requireValue(canonicalJSON(files) === canonicalJSON([layout.artifact, layout.evidence].sort()), 'PLAN1_QUALIFICATION_EVIDENCE', `${action} wrote files outside its fresh allowed action layout`);
  return { action, visibility: pair.visibility, status: 'succeeded', producer, verifier: verifierCommand, evidence: { outcome: layout.outcome, input_files: task.source_evidence.input_files, artifact, verifier: task.source_evidence.verifier, action_evidence } };
}

/**
 * Executes only explicitly configured native qualification commands. It never
 * mutates frozen manifests and never contains an Agent/model dispatch path.
 */
export async function runNativeQualification(manifests, config, { spawnImpl = spawn, env = process.env } = {}) {
  const plan = await prepareNativeQualification(manifests, config);
  if (config.execute !== true) return plan;
  requireValue(config.confirm_native_qualification === true, 'PLAN1_NATIVE_EXECUTION_CONFIRMATION', 'Native qualification needs an explicit execution confirmation');
  requireValue(plan.toolchain.platform.kind !== 'windows', 'PLAN1_WINDOWS_EXECUTION_UNQUALIFIED', 'Windows qualification execution is forbidden until a qualified native broker is integrated');
  const tasks = [];
  for (const task of plan.tasks) {
    if (!task.ready_to_execute) { tasks.push({ task_id: task.task_id, status: 'BLOCKED', reason_code: 'SOURCE_PATH_MISSING', receipts: {} }); continue; }
    const receipts = {};
    for (const action of ACTIONS) {
      const action_run_root = await freshActionRoot(task.action_run_roots[action]);
      const pair = task.commands[action];
      await verifyWslIsolation(pair.producer, { cwd: action_run_root, env, spawnImpl });
      const producerResult = await runCommand(pair.producer, { cwd: action_run_root, env, spawnImpl });
      let verifierResult = { status: 'not_run', exit_code: null };
      if (producerResult.status === 'succeeded') {
        await verifyWslIsolation(pair.verifier, { cwd: action_run_root, env, spawnImpl });
        verifierResult = await runCommand(pair.verifier, { cwd: action_run_root, env, spawnImpl });
      }
      receipts[action] = await qualificationReceipt(action, pair, producerResult, verifierResult, { ...task, source_root: plan.source_root, action_run_root });
      if (receipts[action].status !== 'succeeded') break;
    }
    tasks.push({ task_id: task.task_id, status: Object.values(receipts).every(receipt => receipt.status === 'succeeded') ? 'READY' : 'BLOCKED', reason_code: Object.values(receipts).every(receipt => receipt.status === 'succeeded') ? null : 'QUALIFICATION_COMMAND_FAILED', receipts });
  }
  return { schema: 'plan1-native-qualification-report-v1', status: tasks.every(task => task.status === 'READY') ? 'READY' : 'BLOCKED', comparison_status: 'NOT_RUN', plan2_status: 'LOCKED', platform: plan.toolchain.platform, toolchain_manifest_sha256: digest(canonicalJSON(plan.toolchain)), plan_sha256: plan.plan_sha256, tasks, report_sha256: digest(canonicalJSON(tasks)) };
}
