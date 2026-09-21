import { createDraft } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-schema.mjs';
import { validateWorkflowGraph } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-validator.mjs';
import { validateHostToolContract } from '../../plugins/codex-agents-workflow/control-plane/lib/execution/host-tool-runner.mjs';
import { canonicalJSON, digest } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';
import { PLAN1_ARMS, PLAN1_TASK_IDS, validatePlan1Manifests } from './harness.mjs';
import { win32 } from 'node:path';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), { code }); };
const taskSet = tasks => Array.isArray(tasks) && tasks.length === PLAN1_TASK_IDS.length && [...tasks].sort().join('\0') === [...PLAN1_TASK_IDS].sort().join('\0');
const edge = (source, target) => ({ id: `${source}-to-${target}`, source, target });
const systemWsl = value => typeof value === 'string' && win32.isAbsolute(value) && win32.basename(value).toLowerCase() === 'wsl.exe' && win32.dirname(value).replace(/\/+$/, '').toLowerCase().endsWith('\\windows\\system32');

const candidateOutput = Object.freeze({
  type: 'object',
  properties: {
    decision_id: { type: 'string' },
    decision: { enum: ['candidate_ready', 'blocked'] },
    references: { type: 'array', items: { type: 'string' }, maxItems: 16 },
  },
  required: ['decision_id', 'decision', 'references'],
  additionalProperties: false,
});

const nativeLunaProvider = Object.freeze({
  id: 'native-luna', kind: 'native_agent', enabled: true,
  capabilities: { read: true, write: true },
  config: { model: 'gpt-5.6-luna', reasoning_effort: 'max', role: 'implementer', fresh_context: true },
});

export const PLAN1_WORKFLOW_SPECS = Object.freeze({
  'crystallographic-wyckoff-position-analysis': {
    name: 'Plan 1 — crystallographic Wyckoff analysis',
    executables: ['python'],
    resource_documents: {
      'workflow/task-contract.md': 'This is an implementation task: write solution.py even when pymatgen is not installed in the current authoring environment. Local runtime dependency absence limits validation but is not a blocker for authoring the deliverable. Use the public task contract exactly: expose analyze_wyckoff_position_multiplicities_and_coordinates(filepath), return multiplicity and representative-coordinate dictionaries, and never hardcode fixture answers. Block only when required public task inputs or the contract cannot be read, the declared workspace cannot be written, or the artifact cannot be produced.',
      'workflow/method.md': 'Author solution.py to parse each CIF with pymatgen at invocation time. Use SpacegroupAnalyzer.get_symmetry_dataset().wyckoffs to obtain one Wyckoff letter per input site. Count every site label for multiplicities, retain the first input-site fractional coordinate for each letter, and rationalize each coordinate with Fraction.limit_denominator(12) without normalizing an exact coordinate value of 1 to 0. Return coordinate strings and preserve the task schema. If pymatgen is unavailable while authoring, do not install it and do not block: perform dependency-independent checks such as Python compilation and required-symbol inspection, and record that runtime validation was unavailable.',
    },
    stages: [{
      id: 'author-analyzer', label: 'Author the Wyckoff analyzer', access: 'bounded_write',
      resources: [
        'workflow/task-contract.md',
        'workflow/method.md',
      ],
      prompt_template: 'Implement the fixed crystallographic task in the declared workspace as solution.py. Use only the declared Workflow-native task contract and method resources. This is code authoring, not a requirement to execute pymatgen during the node: if pymatgen is absent locally, still write the complete implementation, do not install anything, and run dependency-independent checks. Parse each supplied CIF at invocation time with pymatgen, obtain one Wyckoff letter per input site from get_symmetry_dataset().wyckoffs, count every site label for multiplicities, retain the first input-site coordinate for each letter, and rationalize each coordinate with denominator at most 12 while preserving an exact coordinate value of 1. Preserve the exact entry function and output keys from workflow/task-contract.md; never hardcode sample answers. Return decision=candidate_ready after producing the artifact. Return decision=blocked only if a required public task input or contract cannot be read, the declared workspace cannot be written, or solution.py cannot be produced; missing local runtime dependencies alone are never a blocker for this implementation task.',
    }],
  },
  'earthquake-plate-calculation': {
    name: 'Plan 1 — Pacific plate earthquake distance',
    executables: ['python'],
    resource_documents: {
      'workflow/task-contract.md': 'Write answer.json with exactly id, place, time, magnitude, latitude, longitude, and distance_km. Time is UTC ISO-8601 and distance_km is rounded to two decimals.',
      'workflow/method.md': 'Load all three public GeoJSON inputs with GeoPandas. Select the Pacific plate by code PA, keep earthquakes spatially within that polygon, keep boundary features whose PlateA or PlateB is PA, project points and boundaries to EPSG:4087, calculate point-to-boundary distances in projected metres, select the maximum, and serialize the associated earthquake metadata. Do not use degree or Haversine distances.',
    },
    stages: [{
      id: 'analyze-earthquakes', label: 'Analyze earthquakes and write answer', access: 'bounded_write',
      resources: ['workflow/task-contract.md', 'workflow/method.md'],
      prompt_template: 'Complete the fixed geospatial task in the declared workspace and write answer.json. Apply the declared Workflow-native method: load the three frozen GeoJSON inputs, identify the Pacific plate by code PA, retain earthquakes within it, retain boundaries whose PlateA or PlateB is PA, project points and boundaries to EPSG:4087 before distance, select the maximum distance, convert milliseconds to the required UTC ISO-8601 form, and round distance_km to two decimals. Do not use manual degree or Haversine distances and do not hardcode the result. Return decision=candidate_ready after producing the artifact; return decision=blocked if execution cannot complete.',
    }],
  },
  'lake-warming-attribution': {
    name: 'Plan 1 — lake warming attribution',
    executables: ['python'],
    resource_documents: {
      'workflow/task-contract.md': 'Write output/trend_result.csv with columns slope,p-value and output/dominant_factor.csv with columns variable,contribution and one dominant-factor row.',
      'workflow/trend-method.md': "For this environmental time series, follow the source Skill's preferred non-parametric method: order WaterTemperature by Year and run pymannkendall.original_test(values). Report the returned Sen slope and Mann-Kendall p-value, each rounded to two decimal places. Do not substitute scipy.stats.linregress for the significance test.",
      'workflow/attribution-method.md': "Merge the public temperature, climate, land-cover, hydrology tables on Year. Derive NetRadiation = Shortwave + Longwave. Use predictors AirTempLake, NetRadiation, Precip, Inflow, Outflow, WindSpeedLake, DevelopedArea, AgricultureArea; standardize them together; then use factor_analyzer.FactorAnalyzer(n_factors=4, rotation='varimax') for one global decomposition. Map factors to Heat, Flow, Wind, Human from their loadings. Fit LinearRegression on all factor scores, calculate each contribution as R2_full - R2_without_factor, multiply each contribution by 100, choose the largest mapped category, and round that percentage to the nearest integer. Contributions need not sum to R2: do not normalize them to total 100, and do not replace factor_analyzer.FactorAnalyzer with sklearn.decomposition.FactorAnalysis.",
    },
    stages: [
      {
        id: 'trend-analysis', label: 'Compute the warming trend', access: 'bounded_write',
        resources: ['workflow/task-contract.md', 'workflow/trend-method.md'],
        prompt_template: "Using only the frozen CSV inputs and the declared Workflow-native trend method, compute the requested environmental trend and write output/trend_result.csv with exactly slope and p-value columns. Use pymannkendall.original_test on WaterTemperature ordered by Year; report its Sen slope and Mann-Kendall p-value rounded to two decimal places. Do not infer any reference answer. Return decision=candidate_ready after producing the artifact; return decision=blocked if the declared inputs are unusable.",
      },
      {
        id: 'driver-attribution', label: 'Attribute the dominant warming driver', access: 'bounded_write',
        resources: [
          'workflow/task-contract.md',
          'workflow/attribution-method.md',
        ],
        prompt_template: "Using the frozen climate, land-cover, hydrology, and water-temperature CSV inputs, write output/dominant_factor.csv with exactly variable and contribution columns and only the dominant category. Follow the pinned source rules exactly: derive NetRadiation, standardize the declared predictors together, use factor_analyzer.FactorAnalyzer with four factors and varimax rotation, map factors from loadings, calculate each leave-one-factor-out R-squared difference, multiply by 100, choose the largest category, and round its percentage to the nearest integer. Do not normalize contributions to total 100, substitute sklearn FactorAnalysis, or hardcode a category or value. Return decision=candidate_ready after producing the artifact; return decision=blocked if the method cannot be executed.",
      },
    ],
  },
  'video-silence-remover': {
    name: 'Plan 1 — video silence remover',
    executables: ['python', 'ffmpeg', 'ffprobe'],
    resource_documents: {
      'workflow/task-contract.md': 'Remove the opening and long pauses from the public input video. Write compressed_video.mp4 and compression_report.json with original_duration_seconds, compressed_duration_seconds, removed_duration_seconds, compression_percentage, and segments_removed.',
      'workflow/method.md': 'Use the common public_tools scripts in this order: extract mono 16 kHz audio; compute one-second RMS energy; detect the initial opening; detect local dynamic pauses of at least two seconds; combine removal segments; render with ffmpeg; and generate the report. Choose only documented parameters and preserve teaching content.',
    },
    stages: [{
      id: 'select-removal-policy', label: 'Select parameters and execute the public media pipeline', access: 'bounded_write',
      resources: [
        'workflow/task-contract.md',
        'workflow/method.md',
      ],
      prompt_template: 'Process the frozen input video in the declared workspace using the arm-neutral scripts under task_root/public_tools. Follow the pinned Workflow method in order: mono 16 kHz audio extraction, one-second RMS energy, initial-opening detection, local dynamic pause detection with pauses at least two seconds, segment combination, ffmpeg-based removal, and report generation. Choose only documented parameters, preserve teaching content, and write compressed_video.mp4 plus compression_report.json. Never encode expected durations or hidden-answer values. Return decision=candidate_ready after producing the artifacts; return decision=blocked when an input or executable is missing.',
    }],
  },
});

/**
 * Pin the only wrapper surface available during a comparison.  This accepts
 * native WSL or Windows toolchains only; it deliberately has no Docker or
 * model-dispatch option.
 */
export function buildNativeToolchainManifest({ platform, wrapper_contract, wrapper_contracts } = {}) {
  requireValue(object(platform) && ['wsl', 'windows'].includes(platform.kind), 'PLAN1_PLATFORM_REQUIRED', 'Plan 1 requires an explicitly selected WSL or Windows native platform');
  requireValue(platform.sandbox !== 'docker', 'PLAN1_DOCKER_FORBIDDEN', 'Docker is forbidden for Plan 1');
  requireValue(platform.sandbox === 'native', 'PLAN1_NATIVE_SANDBOX_REQUIRED', 'Plan 1 requires the native platform sandbox marker');
  if (platform.kind === 'wsl') requireValue(object(platform.launcher) && Object.keys(platform.launcher).every(key => ['executable', 'distribution'].includes(key)) && systemWsl(platform.launcher.executable) && platform.launcher.distribution === 'Ubuntu', 'PLAN1_WSL_LAUNCHER_REQUIRED', 'Linux qualification must explicitly use an absolute Windows System32 wsl.exe -d Ubuntu launcher');
  requireValue(typeof platform.toolchain_id === 'string' && platform.toolchain_id.length > 0 && platform.toolchain_id.length <= 256, 'PLAN1_PLATFORM_REQUIRED', 'Plan 1 requires one bounded native toolchain ID');
  requireValue(object(platform.isolation) && ['qualified_native_broker', 'independent_attestation'].includes(platform.isolation.kind) && platform.isolation.network_disabled === true && platform.isolation.independently_verified === true && typeof platform.isolation.id === 'string' && platform.isolation.id.length > 0 && /^[a-f0-9]{64}$/.test(platform.isolation.evidence_sha256), 'PLAN1_NATIVE_ISOLATION_REQUIRED', 'Native qualification needs a qualified broker or independently verified network-disabled isolation attestation');
  const rawWrappers = wrapper_contracts ?? (wrapper_contract ? [wrapper_contract] : []);
  requireValue(Array.isArray(rawWrappers) && rawWrappers.length >= 1 && rawWrappers.length <= 4, 'PLAN1_WRAPPER_REQUIRED', 'Plan 1 requires a bounded common wrapper surface');
  const wrappers = rawWrappers.map(validateHostToolContract);
  requireValue(new Set(wrappers.map(wrapper => wrapper.id)).size === wrappers.length, 'PLAN1_WRAPPER_REQUIRED', 'Plan 1 wrapper IDs must be unique');
  requireValue(wrappers.every(wrapper => wrapper.permissions.network === false), 'PLAN1_WRAPPER_NETWORK', 'Every common qualification wrapper must declare network disabled');
  return {
    schema: 'plan1-native-toolchain-v1', status: 'NOT_QUALIFIED', platform: structuredClone(platform),
    wrapper_contracts: wrappers, wrapper_contract_sha256: digest(canonicalJSON(wrappers)),
    wrapper_policy: { public_validation_only: true, hidden_judging_excluded: true, identical_for_arms: [...PLAN1_ARMS], paid_dispatch: 'FORBIDDEN', docker: 'FORBIDDEN' },
  };
}

function fixedInputSchema(task) {
  return { type: 'object', properties: {
    task_id: { const: task.task_id }, task_root: { const: task.task_root }, workspace: { type: 'string', minLength: 1, maxLength: 4096 },
    preflight_action: { const: 'input_preflight' }, helper_action: { const: 'common_helper' }, public_validation_action: { const: 'public_validation' },
    task_instruction: { type: 'string', minLength: 1, maxLength: 32768 },
  }, required: ['task_id', 'task_root', 'workspace', 'preflight_action', 'helper_action', 'public_validation_action', 'task_instruction'], additionalProperties: false };
}

function wrapperInput(actionPointer, extra = {}) {
  return { task_id: '/inputs/task_id', task_root: '/inputs/task_root', workspace: '/inputs/workspace', action: actionPointer, ...extra };
}

function taskWorkflow(task, wrappers) {
  const spec = PLAN1_WORKFLOW_SPECS[task.task_id];
  requireValue(object(spec), 'PLAN1_WORKFLOW_SPEC', `Missing task-specific Workflow spec for ${task.task_id}`);
  const readWrapper = wrappers.find(wrapper => wrapper.permissions.write_paths.length === 0) ?? wrappers[0];
  const writeWrapper = wrappers.find(wrapper => wrapper.permissions.write_paths.length > 0) ?? readWrapper;
  const workflow = { ...createDraft(`plan1-${task.task_id}`, spec.name), status: 'ready', description: 'Generated task-specific pre-comparison Workflow. Task-execution semantic nodes run in isolated Native Luna / Max child sessions while final acceptance stays in the Terra / Medium main controller; deterministic public operations use the arm-neutral common host wrapper. Oracle and hidden judging are excluded.', tags: ['plan1', 'pre-comparison', 'native', 'heterogeneous-models', 'luna-max-workers', 'terra-medium-main'], inputs_schema: fixedInputSchema(task), outputs_schema: {}, host_tools: wrappers, requirements: { providers: ['native-luna'], tools: [...wrappers.map(wrapper => wrapper.id), 'read_workflow_resource'], mcp_servers: [], executables: [] }, skill_policy: { mode: 'cooperative', implicit: 'allow', ambient_allow: [], shadowed_skill_paths: [] }, finalization: { required: true, node_id: 'final' } };
  const semanticNodes = spec.stages.map((stage, index) => ({
    id: stage.id, type: 'agent', executor: { kind: 'provider', provider_id: 'native-luna' }, role: 'implementer', access: stage.access,
    ...(stage.access === 'bounded_write' ? { path_scope: ['.'] } : {}),
    approval: { required: false }, retry: { max_attempts: 1 },
    input_bindings: {
      task_id: '/inputs/task_id', task_root: '/inputs/task_root', workspace: '/inputs/workspace', task_instruction: '/inputs/task_instruction', preflight: '/nodes/preflight/output',
      ...(index > 0 ? { prior_stage: `/nodes/${spec.stages[index - 1].id}/output` } : {}),
    },
    label: stage.label, prompt_template: stage.prompt_template, resources: [...stage.resources],
    outputs_schema: structuredClone(candidateOutput),
    decision: { id: `${stage.id}-disposition`, options: ['candidate_ready', 'blocked'], required_references: [...stage.resources] },
  }));
  workflow.nodes = [
    { id: 'start', type: 'start' },
    { id: 'preflight', type: 'tool', executor: { kind: 'tool', tool: readWrapper.id }, access: 'read_only', approval: { required: false }, retry: { max_attempts: 1 }, input_bindings: wrapperInput('/inputs/preflight_action'), outputs_schema: structuredClone(readWrapper.output_schema) },
    ...semanticNodes,
    { id: 'helper', type: 'tool', executor: { kind: 'tool', tool: writeWrapper.id }, access: 'bounded_write', path_scope: ['.'], approval: { required: false }, retry: { max_attempts: 1 }, input_bindings: wrapperInput('/inputs/helper_action'), outputs_schema: structuredClone(writeWrapper.output_schema) },
    { id: 'public-validation', type: 'tool', executor: { kind: 'tool', tool: readWrapper.id }, access: 'read_only', approval: { required: false }, retry: { max_attempts: 1 }, input_bindings: wrapperInput('/inputs/public_validation_action', { helper_receipt: '/nodes/helper/output' }), outputs_schema: structuredClone(readWrapper.output_schema) },
    { id: 'final', type: 'agent', executor: { kind: 'main' }, role: 'finalizer', access: 'read_only', approval: { required: false }, retry: { max_attempts: 1 }, input_bindings: { task_id: '/inputs/task_id', public_validation: '/nodes/public-validation/output' }, prompt_template: 'Accept or reject only from the declared public-validation receipt. Do not claim hidden judging or oracle success.', outputs_schema: { type: 'object', properties: { accepted: { type: 'boolean' } }, required: ['accepted'], additionalProperties: false } },
    { id: 'end', type: 'end' },
  ];
  const ordered = ['start', 'preflight', ...spec.stages.map(stage => stage.id), 'helper', 'public-validation', 'final', 'end'];
  workflow.edges = ordered.slice(0, -1).map((source, index) => edge(source, ordered[index + 1]));
  return workflow;
}

/**
 * Deterministically creates the four frozen sampled task graphs and an arm-neutral wrapper
 * surface.  It does not register, execute, or dispatch any Agent.
 */
export function compilePlan1Fixtures(manifests, nativeToolchain) {
  validatePlan1Manifests(manifests); const toolchain = buildNativeToolchainManifest(nativeToolchain);
  const tasks = manifests['source_manifest.json'].tasks;
  requireValue(taskSet(tasks.map(task => task.task_id)), 'PLAN1_SOURCE_MANIFEST', 'The fixture compiler accepts only the frozen sampled four-task source manifest');
  const workflows = tasks.map(task => taskWorkflow(task, toolchain.wrapper_contracts));
  for (const workflow of workflows) {
    const checked = validateWorkflowGraph(workflow, { host_tools: toolchain.wrapper_contracts.map(wrapper => wrapper.id), providers: [nativeLunaProvider] });
    requireValue(checked.valid, 'PLAN1_COMPILED_WORKFLOW_INVALID', `Generated workflow ${workflow.id} is invalid: ${checked.errors.map(error => error.code).join(',')}`);
  }
  const wrapper = toolchain.wrapper_contract_sha256;
  return {
    schema: 'plan1-compiled-workflow-fixtures-v1', status: 'NOT_RUN', platform: structuredClone(toolchain.platform), toolchain_manifest_sha256: digest(canonicalJSON(toolchain)),
    common_wrapper_contract_sha256: wrapper,
    arm_surfaces: Object.fromEntries(PLAN1_ARMS.map(arm => [arm, { common_wrapper_contract_sha256: wrapper, availability: 'available', agent_launch: 'FORBIDDEN_DURING_PREPARATION' }])),
    workflows, comparison_status: 'NOT_RUN', plan2_status: 'LOCKED',
  };
}
