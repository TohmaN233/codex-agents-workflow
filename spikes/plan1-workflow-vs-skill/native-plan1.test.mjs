import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { assertPlan1LaunchAuthorized, readPlan1Manifests } from './harness.mjs';
import { buildNativeToolchainManifest, compilePlan1Fixtures, PLAN1_WORKFLOW_SPECS } from './plan1-fixture-compiler.mjs';
import { prepareNativeQualification, runNativeQualification } from './native-qualification-runner.mjs';
import { digest } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';
import { WorkflowService } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-service.mjs';

const DEFAULT_CONFIG_PATH = fileURLToPath(new URL('../../plugins/codex-agents-workflow/control-plane/default-config.json', import.meta.url));

const wrapper = {
  id: 'plan1-native-wrapper', identity: { name: 'plan1-native-wrapper', version: 'fixture-1', sha256: 'c'.repeat(64) }, argv: ['plan1-native-wrapper', '--public-only'],
  input_schema: { type: 'object', properties: { task_id: { type: 'string' }, task_root: { type: 'string' }, workspace: { type: 'string' }, action: { type: 'string' } }, required: ['task_id', 'task_root', 'workspace', 'action'], additionalProperties: true },
  output_schema: { type: 'object', properties: { public_status: { type: 'string' } }, required: ['public_status'], additionalProperties: false }, env_allow: [], permissions: { network: false, read_paths: [], write_paths: [] }, output_cap_bytes: 4096, deadline_ms: 1000, idempotency: { mode: 'safe' },
};
const platform = { kind: 'windows', toolchain_id: 'fixture-native-toolchain', sandbox: 'native', isolation: { kind: 'qualified_native_broker', id: 'fixture-native-broker', network_disabled: true, independently_verified: true, evidence_sha256: 'e'.repeat(64) } };
async function command(root, taskId, action, visibility) {
  const script = join(root, 'qualification', `${action}.mjs`); const executable = process.execPath;
  return { argv: [executable, script, root, taskId], visibility, deadline_ms: 1000, network: false, env_allow: [], executable: { path: executable, sha256: digest(await readFile(executable)) }, script: { path: script, sha256: digest(await readFile(script)) } };
}
async function verifierCommand(root, task, action, visibility) {
  const script = join(root, task.verifier_path); const executable = process.execPath;
  return { argv: [executable, script, root, task.task_id, action], visibility, deadline_ms: 1000, network: false, env_allow: [], executable: { path: executable, sha256: digest(await readFile(executable)) }, script: { path: script, sha256: digest(await readFile(script)) } };
}

async function config(sourceRoot, taskRunRoots, manifests) {
  const action = async (task, name, visibility) => ({ producer: await command(sourceRoot, task.task_id, name, visibility), verifier: await verifierCommand(sourceRoot, task, name, visibility), ...(name === 'counterexample' ? { rejection_exit_code: 42 } : {}) });
  return { comparison_launch: false, agent_arms: [], source_root: sourceRoot, task_run_roots: taskRunRoots, platform, wrapper_contract: wrapper, commands: Object.fromEntries(await Promise.all(manifests['source_manifest.json'].tasks.map(async task => [task.task_id, { oracle: await action(task, 'oracle', 'judge'), counterexample: await action(task, 'counterexample', 'judge'), helper: await action(task, 'helper', 'public') }]))) };
}

async function sourceTree(t, manifests) {
  const root = await mkdtemp(join(tmpdir(), 'plan1-native-')); t.after(() => rm(root, { recursive: true, force: true }));
  const taskRunRoots = {};
  for (const task of manifests['source_manifest.json'].tasks) {
    await mkdir(join(root, task.task_root), { recursive: true });
    taskRunRoots[task.task_id] = join(root, 'run', task.task_id); await mkdir(taskRunRoots[task.task_id], { recursive: true });
    for (const path of [...task.input_paths, ...task.existing_code_paths, task.verifier_path, task.reference_solution_path]) {
    const target = join(root, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, 'fixture');
    }
  }
  for (const [action, outcome] of [['oracle', 'oracle_pass'], ['counterexample', 'counterexample_rejected'], ['helper', 'helper_pass']]) {
    const script = join(root, 'qualification', `${action}.mjs`); await mkdir(dirname(script), { recursive: true }); await writeFile(script, `import { readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { createHash } from 'node:crypto'; const hash=bytes=>createHash('sha256').update(bytes).digest('hex'); const [sourceRoot,taskId]=process.argv.slice(2); const manifest=JSON.parse(await readFile(join(sourceRoot,'qualification','tasks.json'),'utf8')); const task=manifest[taskId]; const input_files=await Promise.all(task.input_paths.map(async path=>({path,sha256:hash(await readFile(join(sourceRoot,path)))}))); const verifier={path:task.verifier_path,sha256:hash(await readFile(join(sourceRoot,task.verifier_path)))}; const artifact={path:${JSON.stringify(action + '.artifact')},sha256:hash(Buffer.from(taskId+${JSON.stringify('-' + action)}))}; await writeFile(join(process.cwd(),artifact.path),taskId+${JSON.stringify('-' + action)}); process.stdout.write(JSON.stringify({outcome:${JSON.stringify(outcome)},input_files,artifact,verifier,evidence:[{kind:'input',root:'source',...input_files[0]},{kind:'artifact',root:'run',...artifact}]}));`);
  }
  await writeFile(join(root, 'qualification', 'tasks.json'), JSON.stringify(Object.fromEntries(manifests['source_manifest.json'].tasks.map(task => [task.task_id, { input_paths: task.input_paths, verifier_path: task.verifier_path }]))));
  return { root, taskRunRoots };
}

test('the deterministic compiler emits four valid workflow fixtures with one identical native wrapper surface for every arm', async () => {
  const manifests = await readPlan1Manifests(); const compiled = compilePlan1Fixtures(manifests, { platform, wrapper_contract: wrapper });
  assert.equal(compiled.status, 'NOT_RUN'); assert.equal(compiled.workflows.length, 4); assert.equal(compiled.comparison_status, 'NOT_RUN');
  const values = Object.values(compiled.arm_surfaces).map(surface => surface.common_wrapper_contract_sha256);
  assert.equal(new Set(values).size, 1); assert(Object.values(compiled.arm_surfaces).every(surface => surface.agent_launch === 'FORBIDDEN_DURING_PREPARATION'));
  assert(compiled.workflows.every(workflow => workflow.nodes.some(node => node.type === 'tool')
    && workflow.nodes.filter(node => node.type === 'agent' && node.id !== 'final').every(node => node.executor.kind === 'provider' && node.executor.provider_id === 'native-luna')
    && workflow.nodes.find(node => node.id === 'final').executor.kind === 'main'));
});

test('the four fixtures are task-specific, resource-minimal, and pin Luna workers with one Main finalizer', async () => {
  const manifests = await readPlan1Manifests();
  const writeWrapper = { ...structuredClone(wrapper), id: 'plan1-native-write-wrapper', identity: { name: 'plan1-native-write-wrapper', version: 'fixture-1', sha256: 'd'.repeat(64) }, permissions: { network: false, read_paths: ['.'], write_paths: ['.'] } };
  const compiled = compilePlan1Fixtures(manifests, { platform, wrapper_contracts: [wrapper, writeWrapper] });
  const expectedStages = {
    'crystallographic-wyckoff-position-analysis': ['author-analyzer'],
    'earthquake-plate-calculation': ['analyze-earthquakes'],
    'lake-warming-attribution': ['trend-analysis', 'driver-attribution'],
    'video-silence-remover': ['select-removal-policy'],
  };
  for (const workflow of compiled.workflows) {
    const taskId = workflow.inputs_schema.properties.task_id.const;
    const agents = workflow.nodes.filter(node => node.type === 'agent');
    assert.deepEqual(agents.map(node => node.id), [...expectedStages[taskId], 'final']);
    assert(agents.filter(node => node.id !== 'final').every(node => node.executor.kind === 'provider' && node.executor.provider_id === 'native-luna'));
    assert.equal(agents.find(node => node.id === 'final').executor.kind, 'main');
    assert.deepEqual(workflow.requirements.providers, ['native-luna']);
    for (const node of agents.filter(node => node.id !== 'final')) assert.equal(Object.hasOwn(node.outputs_schema.properties, 'candidate_manifest'), false);
    assert.equal(workflow.nodes.find(node => node.id === 'preflight').executor.tool, wrapper.id);
    assert.equal(workflow.nodes.find(node => node.id === 'helper').executor.tool, writeWrapper.id);
    assert.equal(workflow.nodes.find(node => node.id === 'public-validation').executor.tool, wrapper.id);
    const allowed = new Set(Object.keys(PLAN1_WORKFLOW_SPECS[taskId].resource_documents));
    for (const node of agents) for (const resource of node.resources ?? []) assert(allowed.has(resource));
    assert(![...allowed].some(path => /(?:^|\/)(?:skills?|oracle|verifier)(?:\/|$)/i.test(path)));
  }
  assert.equal(new Set(compiled.workflows.map(workflow => workflow.nodes.map(node => node.id).join('|'))).size, 4);
});

test('implementation-only runtime dependencies cannot block the crystallographic authoring node', async () => {
  const manifests = await readPlan1Manifests();
  const compiled = compilePlan1Fixtures(manifests, { platform, wrapper_contract: wrapper });
  const workflow = compiled.workflows.find(item => item.id === 'plan1-crystallographic-wyckoff-position-analysis');
  const author = workflow.nodes.find(node => node.id === 'author-analyzer');
  assert.match(author.prompt_template, /missing local runtime dependencies alone are never a blocker/i);
  assert.match(author.prompt_template, /return decision=candidate_ready/i);
  assert.doesNotMatch(author.prompt_template, /if an input or dependency is unavailable, return decision=blocked/i);
  assert.match(PLAN1_WORKFLOW_SPECS['crystallographic-wyckoff-position-analysis'].resource_documents['workflow/task-contract.md'], /runtime dependency absence limits validation but is not a blocker/i);
  assert.match(PLAN1_WORKFLOW_SPECS['crystallographic-wyckoff-position-analysis'].resource_documents['workflow/method.md'], /count every site label/i);
  assert.match(PLAN1_WORKFLOW_SPECS['crystallographic-wyckoff-position-analysis'].resource_documents['workflow/method.md'], /without normalizing an exact coordinate value of 1 to 0/i);
});

test('lake conversion preserves the source statistical APIs, percentage transform and rounding', () => {
  const spec = PLAN1_WORKFLOW_SPECS['lake-warming-attribution'];
  const trend = spec.resource_documents['workflow/trend-method.md'];
  const attribution = spec.resource_documents['workflow/attribution-method.md'];
  assert.match(trend, /pymannkendall\.original_test/);
  assert.match(trend, /Sen slope/);
  assert.match(trend, /Mann-Kendall p-value/);
  assert.match(trend, /rounded to two decimal places/);
  assert.match(attribution, /factor_analyzer\.FactorAnalyzer/);
  assert.match(attribution, /R2_full - R2_without_factor/);
  assert.match(attribution, /multiply each contribution by 100/);
  assert.match(attribution, /round that percentage to the nearest integer/);
  assert.match(attribution, /do not normalize them to total 100/);
  assert.doesNotMatch(attribution, /use sklearn\.decomposition\.FactorAnalysis/);
  assert.match(spec.stages.find(stage => stage.id === 'trend-analysis').prompt_template, /pymannkendall\.original_test/);
  assert.match(spec.stages.find(stage => stage.id === 'driver-attribution').prompt_template, /multiply by 100/);
});

test('all four compiled fixtures validate and start through WorkflowService with one registered host-tool capability name', async t => {
  const manifests = await readPlan1Manifests(); const compiled = compilePlan1Fixtures(manifests, { platform, wrapper_contract: wrapper });
  const root = await mkdtemp(join(tmpdir(), 'plan1-service-')); const workspace = join(root, 'workspace'); await mkdir(workspace); t.after(() => rm(root, { recursive: true, force: true }));
  const service = new WorkflowService({ configPath: join(root, 'control-plane.json'), defaultConfigPath: DEFAULT_CONFIG_PATH, env: {}, capabilities: {
    context: { check_runtime_requirements: true },
    hostToolRegistry: { [wrapper.id]: {
      identity: wrapper.identity,
      attestation: { qualified: true, cancellable: true, effect_observation: true, tool_identity: wrapper.identity, broker_id: 'fixture-native-broker', evidence_sha256: 'f'.repeat(64) },
      execute: async () => { throw new Error('Fixture preparation must never execute a host tool'); },
      cancel: async () => { throw new Error('Fixture preparation must never cancel a host tool'); },
    } },
  } });
  await service.call('migrate_v6', {}, { human: true });
  const capabilities = await service.call('capabilities'); assert(capabilities.tools.includes(wrapper.id));
  for (const workflow of compiled.workflows) {
    const validation = await service.call('validate', { workflow }); assert.equal(validation.valid, true); assert.equal(validation.launch_ready, true);
    const created = await service.call('create', { workflow });
    const input = { task_id: workflow.inputs_schema.properties.task_id.const, task_root: workflow.inputs_schema.properties.task_root.const, workspace, preflight_action: 'input_preflight', helper_action: 'common_helper', public_validation_action: 'public_validation', task_instruction: 'Fixture-only preparation; do not launch an Agent.' };
    const run = await service.call('start', { workflow_id: created.workflow.id, revision_hash: created.revision_hash, workspace, access: 'bounded_write', allowed_paths: ['out'], main_actor: 'fixture', inputs: input });
    assert.equal(run.status, 'running');
  }
});

test('native platform configuration rejects Docker before compiler or runner work begins', async () => {
  assert.throws(() => buildNativeToolchainManifest({ platform: { ...platform, sandbox: 'docker' }, wrapper_contract: wrapper }), { code: 'PLAN1_DOCKER_FORBIDDEN' });
  assert.throws(() => buildNativeToolchainManifest({ platform: { ...platform, kind: 'wsl' }, wrapper_contract: wrapper }), { code: 'PLAN1_WSL_LAUNCHER_REQUIRED' });
  const wslExe = 'C:\\Windows\\System32\\wsl.exe';
  assert.equal(buildNativeToolchainManifest({ platform: { ...platform, kind: 'wsl', launcher: { executable: wslExe, distribution: 'Ubuntu' } }, wrapper_contract: wrapper }).platform.launcher.executable, wslExe);
  const manifests = await readPlan1Manifests(); const fixture = await sourceTree({ after: () => {} }, manifests);
  try { await assert.rejects(prepareNativeQualification(manifests, { ...await config(fixture.root, fixture.taskRunRoots, manifests), platform: { ...platform, sandbox: 'docker' } }), { code: 'PLAN1_DOCKER_FORBIDDEN' }); }
  finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test('native qualification dry-runs only on Windows and rejects execute without a qualified broker', async t => {
  const manifests = await readPlan1Manifests(); const fixture = await sourceTree(t, manifests); const { root, taskRunRoots } = fixture; const settings = await config(root, taskRunRoots, manifests);
  const plan = await runNativeQualification(manifests, settings); assert.equal(plan.status, 'NOT_RUN'); assert.equal(plan.mode, 'DRY_RUN'); assert(plan.tasks.every(task => task.ready_to_execute));
  await assert.rejects(runNativeQualification(manifests, { ...settings, execute: true, confirm_native_qualification: true }), { code: 'PLAN1_WINDOWS_EXECUTION_UNQUALIFIED' });
  await assert.rejects(prepareNativeQualification(manifests, { ...settings, agent_arms: ['W-main'] }), { code: 'PLAN1_PAID_DISPATCH_FORBIDDEN' });
  const forbidden = structuredClone(settings); forbidden.commands['crystallographic-wyckoff-position-analysis'].helper.producer.argv = ['docker', 'run'];
  await assert.rejects(prepareNativeQualification(manifests, forbidden), { code: 'PLAN1_DOCKER_OR_MODEL_FORBIDDEN' });
  const paid = structuredClone(settings); paid.commands['crystallographic-wyckoff-position-analysis'].oracle.producer.argv = ['bench', 'eval', '--agent', 'oracle'];
  await assert.rejects(prepareNativeQualification(manifests, paid), { code: 'PLAN1_DOCKER_OR_MODEL_FORBIDDEN' });
});

async function wslSettings(settings, sourceRoot, taskRunRoots, manifests) {
  const wslExe = 'C:\\Windows\\System32\\wsl.exe'; const wsl = structuredClone(settings); const toWsl = path => '/mnt/c/' + path.replace(/^C:\\/, '').replace(/\\/g, '/');
  wsl.platform = { ...platform, kind: 'wsl', launcher: { executable: wslExe, distribution: 'Ubuntu' } };
  const wslHash = digest(await readFile(wslExe));
  for (const [taskId, commands] of Object.entries(wsl.commands)) for (const [action, pair] of Object.entries(commands)) for (const role of ['producer', 'verifier']) {
    const command = pair[role]; const hostScript = command.script.path; const actionRoot = join(taskRunRoots[taskId], '.plan1-action-runs', action); const task = manifests['source_manifest.json'].tasks.find(item => item.task_id === taskId); const script = role === 'producer' ? `/source/qualification/${action}.mjs` : `/source/${task.verifier_path}`;
    const isolation = ['--unshare-net', '--die-with-parent', '--ro-bind', toWsl(sourceRoot), '/source', '--bind', toWsl(actionRoot), '/work', '--tmpfs', '/tmp', '--proc', '/proc', '--dev', '/dev', '--chdir', '/work', '--'];
    command.executable = { path: wslExe, sha256: wslHash }; command.script = { path: script, host_path: hostScript, sha256: command.script.sha256 };
    command.wsl_isolation = { bwrap: { path: '/usr/bin/bwrap', sha256: 'e'.repeat(64) }, argv: isolation };
    command.argv = [wslExe, '-d', 'Ubuntu', '--', '/usr/bin/bwrap', ...isolation, '/usr/bin/node', script, '/source', taskId, action];
  }
  return wsl;
}

function mockWslQualification({ verifierFailureAction = null, calls = { producers: 0, verifiers: 0 } } = {}) {
  const layouts = { oracle: { artifact: 'artifacts/oracle-product.json' }, counterexample: { artifact: 'artifacts/counterexample-product.json' }, helper: { artifact: 'artifacts/helper-product.json' } };
  return (_file, args, { cwd }) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.kill = () => true;
    queueMicrotask(() => void (async () => {
      if (args.includes('sha256sum')) { child.stdout.emit('data', 'e'.repeat(64) + '  /usr/bin/bwrap\\n'); child.emit('close', 0); return; }
      const action = args.at(-1); const producer = args.includes(`/source/qualification/${action}.mjs`);
      if (producer) { calls.producers++; const artifact = layouts[action].artifact; await mkdir(dirname(join(cwd, artifact)), { recursive: true }); await writeFile(join(cwd, artifact), `artifact:${action}`); child.stdout.emit('data', JSON.stringify({ outcome: 'forged-producer-json', evidence: 'ignored-by-runner' })); child.emit('close', 0); return; }
      calls.verifiers++; const exitCode = verifierFailureAction === action ? (action === 'counterexample' ? 0 : 7) : (action === 'counterexample' ? 42 : 0); child.emit('close', exitCode);
    })().catch(error => child.emit('error', error)));
    return child;
  };
}

test('WSL dry-run enforces fresh action roots and its mocked runner re-reads fixed evidence without launching WSL', async t => {
  const manifests = await readPlan1Manifests(); const fixture = await sourceTree(t, manifests); const wsl = await wslSettings(await config(fixture.root, fixture.taskRunRoots, manifests), fixture.root, fixture.taskRunRoots, manifests);
  const plan = await prepareNativeQualification(manifests, wsl); assert.equal(plan.status, 'NOT_RUN'); assert(plan.tasks.every(task => task.commands.oracle.producer.wsl_isolation.argv.includes('--ro-bind') && task.commands.oracle.producer.wsl_isolation.argv.includes('--bind') && task.commands.oracle.producer.wsl_isolation.argv.includes('--tmpfs') && task.commands.oracle.producer.wsl_isolation.argv.includes('--proc') && task.commands.oracle.producer.wsl_isolation.argv.includes('--dev')));
  const calls = { producers: 0, verifiers: 0 }; const report = await runNativeQualification(manifests, { ...wsl, execute: true, confirm_native_qualification: true }, { spawnImpl: mockWslQualification({ calls }) }); assert.equal(report.status, 'READY'); assert.equal(report.comparison_status, 'NOT_RUN'); assert(report.tasks.every(task => task.status === 'READY')); assert.equal(calls.producers, 12); assert.equal(calls.verifiers, 12);
  const stale = await prepareNativeQualification(manifests, wsl); assert(stale.tasks.every(task => task.ready_to_execute === false));
  const qualified = structuredClone(manifests); qualified['task_qualification.json'].tasks = report.tasks.map(task => ({ task_id: task.task_id, status: 'READY', oracle_receipt: task.receipts.oracle, mutation_receipt: task.receipts.counterexample, helper_receipt: task.receipts.helper, reason_code: null })); qualified['tool_manifest.json'].qualified = true; qualified['tool_manifest.json'].platform = { kind: 'wsl', toolchain_id: platform.toolchain_id }; qualified['workflow_manifest.json'].qualified = true; qualified['workflow_manifest.json'].conversion_quality={status:'PASS',tasks:manifests['workflow_manifest.json'].conversion_quality.tasks.map(task=>({...task,status:'PASS',conversion_level:'fully_compiled',host_preflight:true,same_algorithm_and_resources:true}))}; qualified['session_identity_audit.json'].verified = true;
  const launch = { platform: wsl.platform, native_qualification_report: report, user_review: { approved: true, reviewer: 'fixture', reviewed_at: '2026-09-19' }, budget_approval: { approval_id: 'fixture-approved', currency: 'USD', limit_micros: 1 }, launch_intent: { confirmed: true } }; assert.equal(assertPlan1LaunchAuthorized(qualified, launch).formal_comparison_status, 'NOT_RUN');
  const forged = await sourceTree(t, manifests); const forgedWsl = await wslSettings(await config(forged.root, forged.taskRunRoots, manifests), forged.root, forged.taskRunRoots, manifests); const failed = await runNativeQualification(manifests, { ...forgedWsl, execute: true, confirm_native_qualification: true }, { spawnImpl: mockWslQualification({ verifierFailureAction: 'oracle' }) }); assert.equal(failed.status, 'BLOCKED'); assert.equal(failed.tasks[0].receipts.oracle.status, 'failed');
  delete wsl.commands['crystallographic-wyckoff-position-analysis'].oracle.producer.wsl_isolation; await assert.rejects(prepareNativeQualification(manifests, wsl), { code: 'PLAN1_WSL_ISOLATION_REQUIRED' });
});

test('a closed WSL launcher is not a process-tree receipt and aborts before another action starts', async t => {
  const manifests = await readPlan1Manifests(); const fixture = await sourceTree(t, manifests); const wsl = await wslSettings(await config(fixture.root, fixture.taskRunRoots, manifests), fixture.root, fixture.taskRunRoots, manifests);
  for (const commands of Object.values(wsl.commands)) for (const pair of Object.values(commands)) for (const command of [pair.producer, pair.verifier]) command.deadline_ms = 10;
  let producerStarts = 0; let kills = 0;
  const launcherOnlyCloses = (_file, args) => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.kill = () => { kills++; queueMicrotask(() => child.emit('close', null)); return true; }; queueMicrotask(() => { if (args.includes('sha256sum')) { child.stdout.emit('data', 'e'.repeat(64) + '  /usr/bin/bwrap\\n'); child.emit('close', 0); } else producerStarts++; }); return child; };
  await assert.rejects(runNativeQualification(manifests, { ...wsl, execute: true, confirm_native_qualification: true }, { spawnImpl: launcherOnlyCloses }), { code: 'TERMINATION_UNCONFIRMED' });
  assert.equal(producerStarts, 1); assert.equal(kills, 1);
});
