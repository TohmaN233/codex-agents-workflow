import { readFile } from 'node:fs/promises';
import { join, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJSON, digest } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';

export const PLAN1_TASK_IDS = Object.freeze(['crystallographic-wyckoff-position-analysis', 'earthquake-plate-calculation', 'lake-warming-attribution', 'video-silence-remover']);
export const PLAN1_ARMS = Object.freeze(['N-main', 'S-main', 'W-control', 'W-main']);
export const MANIFEST_FILES = Object.freeze(['source_manifest.json', 'native_feasibility_report.json', 'feasibility-receipts/crystallographic-wyckoff-position-analysis.json', 'feasibility-receipts/earthquake-plate-calculation.json', 'feasibility-receipts/lake-warming-attribution.json', 'feasibility-receipts/video-silence-remover.json', 'trigger_suite.json', 'task_patch_manifest.json', 'tool_manifest.json', 'workflow_manifest.json', 'session_identity_audit.json', 'candidate_visibility_manifest.json', 'task_qualification.json', 'preregistration.json', 'analysis_manifest.json', 'plan1_gate_report.json']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), { code }); };
const exactTaskSet = values => Array.isArray(values) && values.length === PLAN1_TASK_IDS.length && [...values].sort().join('\0') === [...PLAN1_TASK_IDS].sort().join('\0');
const identity = value => object(value) && typeof value.path === 'string' && value.path.length > 0 && (value.host_path === undefined || typeof value.host_path === 'string' && value.host_path.length > 0) && /^[a-f0-9]{64}$/.test(value.sha256) && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && Object.keys(value).every(key => ['path', 'host_path', 'sha256', 'bytes'].includes(key));
const exactKeys = (value, keys) => object(value) && canonicalJSON(Object.keys(value).sort()) === canonicalJSON([...keys].sort());
const evidenceFile = value => exactKeys(value, ['path', 'sha256', 'bytes']) && typeof value.path === 'string' && value.path.length > 0 && /^[a-f0-9]{64}$/.test(value.sha256) && Number.isSafeInteger(value.bytes) && value.bytes >= 0;
const actionLayout = Object.freeze({
  oracle: { outcome: 'oracle_pass', visibility: 'judge', artifact: 'artifacts/oracle-product.json', evidence: 'evidence/oracle-verdict.json', kind: 'oracle_verdict', verdict: 'passed' },
  counterexample: { outcome: 'counterexample_rejected', visibility: 'judge', artifact: 'artifacts/counterexample-product.json', evidence: 'evidence/counterexample-rejection.json', kind: 'verifier_rejection', verdict: 'rejected' },
  helper: { outcome: 'helper_pass', visibility: 'public', artifact: 'artifacts/helper-product.json', evidence: 'evidence/helper-receipt.json', kind: 'helper_receipt', verdict: 'passed' },
});
function actionEvidence(value, action, artifact, verifier) {
  const layout = actionLayout[action];
  return exactKeys(value, ['path', 'sha256', 'bytes', 'root', 'document']) && value.root === 'action_run_root' && typeof value.path === 'string' && value.path === layout.evidence && /^[a-f0-9]{64}$/.test(value.sha256) && Number.isSafeInteger(value.bytes) && value.bytes > 0 && exactKeys(value.document, action === 'counterexample' ? ['schema', 'action', 'outcome', 'verifier_exit_code', 'artifact_sha256', 'verifier_sha256', 'producer_argv_sha256', 'verifier_argv_sha256', 'rejection_exit_code'] : ['schema', 'action', 'outcome', 'verifier_exit_code', 'artifact_sha256', 'verifier_sha256', 'producer_argv_sha256', 'verifier_argv_sha256']) && value.document.schema === 'plan1-runner-evidence-v2' && value.document.action === action && value.document.outcome === layout.outcome && value.document.artifact_sha256 === artifact.sha256 && value.document.verifier_sha256 === verifier.sha256 && /^[a-f0-9]{64}$/.test(value.document.producer_argv_sha256) && /^[a-f0-9]{64}$/.test(value.document.verifier_argv_sha256) && Number.isInteger(value.document.verifier_exit_code) && (action === 'counterexample' ? value.document.rejection_exit_code === value.document.verifier_exit_code && value.document.verifier_exit_code > 0 : value.document.verifier_exit_code === 0);
}
function commandReceipt(value) {
  return (exactKeys(value, ['argv_sha256', 'executable', 'script', 'status', 'exit_code']) || exactKeys(value, ['argv_sha256', 'executable', 'script', 'status', 'exit_code', 'wsl_isolation'])) && /^[a-f0-9]{64}$/.test(value.argv_sha256) && identity(value.executable) && identity(value.script) && typeof value.status === 'string' && (value.exit_code === null || Number.isInteger(value.exit_code));
}
function receipt(value, action) {
  const layout = actionLayout[action];
  if (!exactKeys(value, ['action', 'visibility', 'status', 'producer', 'verifier', 'evidence'])) return false;
  const evidence = value.evidence;
  return value.action === action && value.status === 'succeeded' && value.visibility === layout.visibility && commandReceipt(value.producer) && value.producer.status === 'succeeded' && value.producer.exit_code === 0 && commandReceipt(value.verifier) && (action === 'counterexample' ? value.verifier.status === 'failed' && value.verifier.exit_code > 0 : value.verifier.status === 'succeeded' && value.verifier.exit_code === 0) && exactKeys(evidence, ['outcome', 'input_files', 'artifact', 'verifier', 'action_evidence']) && evidence.outcome === layout.outcome && Array.isArray(evidence.input_files) && evidence.input_files.length > 0 && evidence.input_files.every(evidenceFile) && evidenceFile(evidence.artifact) && evidence.artifact.path === layout.artifact && evidence.artifact.bytes > 0 && evidenceFile(evidence.verifier) && actionEvidence(evidence.action_evidence, action, evidence.artifact, evidence.verifier) && evidence.action_evidence.document.producer_argv_sha256 === value.producer.argv_sha256 && evidence.action_evidence.document.verifier_argv_sha256 === value.verifier.argv_sha256;
}

export async function readPlan1Manifests(root = new URL('.', import.meta.url)) {
  const base = root instanceof URL ? fileURLToPath(root) : resolve(root);
  const entries = await Promise.all(MANIFEST_FILES.map(async file => [file, JSON.parse(await readFile(join(base, file), 'utf8'))]));
  return Object.fromEntries(entries);
}

/** This is a pre-comparison validator: it never calls a model, tool, or sandbox. */
export function validatePlan1Manifests(manifests) {
  for (const file of MANIFEST_FILES) requireValue(object(manifests[file]), 'PLAN1_MANIFEST_MISSING', `Missing ${file}`);
  const source = manifests['source_manifest.json']; const feasibility = manifests['native_feasibility_report.json']; const trigger = manifests['trigger_suite.json']; const qualification = manifests['task_qualification.json']; const preregistration = manifests['preregistration.json']; const gates = manifests['plan1_gate_report.json']; const workflows = manifests['workflow_manifest.json'];
  requireValue(source.plan_version === '3.0' && source.comparison_status === 'NOT_RUN' && Array.isArray(source.tasks) && exactTaskSet(source.tasks.map(task => task.task_id)) && source.tasks.every(task => object(task) && typeof task.task_root === 'string' && Array.isArray(task.input_paths) && Array.isArray(task.existing_code_paths) && typeof task.verifier_path === 'string' && typeof task.reference_solution_path === 'string'), 'PLAN1_SOURCE_MANIFEST', 'Source manifest is not the frozen selected four-task NOT_RUN qualification input');
  requireValue(feasibility.status === 'READY' && feasibility.formal_comparison_status === 'NOT_RUN' && feasibility.source_commit === source.skillsbench_commit && exactTaskSet(feasibility.tasks?.map(task => task.task_id)) && feasibility.tasks.every(task => task.status === 'READY'), 'PLAN1_NATIVE_FEASIBILITY', 'Every selected task must have a native WSL feasibility receipt before it enters the comparison plan');
  for (const taskId of PLAN1_TASK_IDS) {
    const receipt = manifests[`feasibility-receipts/${taskId}.json`];
    requireValue(receipt.task_id === taskId && receipt.status === 'READY' && receipt.docker === false && receipt.network_during_task === false && receipt.oracle_exit === 0 && receipt.verifier_exit === 0 && receipt.verifier_passed === receipt.verifier_total && receipt.empty_counterexample_exit > 0, 'PLAN1_NATIVE_FEASIBILITY', `Native feasibility receipt failed for ${taskId}`);
  }
  requireValue(Array.isArray(trigger.cases) && trigger.cases.some(item => item.id === 'negative-plan' && item.expected === 'no_run') && trigger.acceptance?.false_positive_count === 0 && trigger.acceptance?.extra_model_router_calls === 0, 'PLAN1_TRIGGER_SUITE', 'Trigger suite must retain the planning false-positive regression and zero-router-call target');
  requireValue(source.platform_policy?.docker === 'FORBIDDEN' && Array.isArray(source.platform_policy?.allowed) && source.platform_policy.allowed.every(value => ['wsl', 'windows'].includes(value)), 'PLAN1_PLATFORM_POLICY', 'Plan 1 must reject Docker and allow only reviewed platform-native execution');
  requireValue(Array.isArray(qualification.tasks) && exactTaskSet(qualification.tasks.map(task => task.task_id)) && qualification.tasks.every(task => ['NOT_RUN', 'READY', 'BLOCKED'].includes(task.status)), 'PLAN1_QUALIFICATION', 'Qualification manifest must report every fixed task as NOT_RUN, READY, or BLOCKED');
  requireValue(exactTaskSet(preregistration.tasks) && canonicalJSON(preregistration.arms) === canonicalJSON(PLAN1_ARMS) && preregistration.formal_comparison_status === 'NOT_RUN', 'PLAN1_PREREGISTRATION', 'Preregistration must preserve the selected four-task, four-arm NOT_RUN comparison');
  requireValue(gates.formal_comparison_status === 'NOT_RUN' && gates.plan2_status === 'LOCKED', 'PLAN1_GATES', 'Formal comparison must remain NOT_RUN and Plan 2 must remain locked');
  requireValue(object(workflows.conversion_quality) && ['NOT_RUN','PASS','BLOCKED'].includes(workflows.conversion_quality.status) && exactTaskSet(workflows.conversion_quality.tasks?.map(task => task.task_id)) && workflows.conversion_quality.tasks.every(task => ['NOT_RUN','PASS','BLOCKED'].includes(task.status)), 'PLAN1_CONVERSION_QUALITY', 'Workflow manifest must report conversion quality for the exact four tasks');
  for (const manifest of Object.values(manifests)) requireValue(!canonicalJSON(manifest).includes('sandbox=docker') && !canonicalJSON(manifest).includes('"sandbox":"docker"'), 'PLAN1_DOCKER_FORBIDDEN', 'Plan 1 manifests must not encode a Docker sandbox');
  return { valid: true, manifest_sha256: digest(canonicalJSON(manifests)), comparison_status: 'NOT_RUN' };
}

function nativePlatform(config) {
  requireValue(config && object(config.platform) && ['wsl', 'windows'].includes(config.platform.kind), 'PLAN1_PLATFORM_REQUIRED', 'Select a platform-native WSL or Windows execution toolchain');
  requireValue(config.platform.sandbox !== 'docker', 'PLAN1_DOCKER_FORBIDDEN', 'Docker is forbidden for Plan 1 qualification and comparison');
  if (config.platform.kind === 'wsl') requireValue(object(config.platform.launcher) && win32.isAbsolute(config.platform.launcher.executable) && win32.basename(config.platform.launcher.executable).toLowerCase() === 'wsl.exe' && win32.dirname(config.platform.launcher.executable).replace(/\/+$/, '').toLowerCase().endsWith('\\windows\\system32') && config.platform.launcher.distribution === 'Ubuntu', 'PLAN1_WSL_LAUNCHER_REQUIRED', 'Linux launch plans must explicitly use absolute System32 wsl.exe -d Ubuntu');
  requireValue(typeof config.platform.toolchain_id === 'string' && config.platform.toolchain_id.length > 0 && config.platform.toolchain_id.length <= 256, 'PLAN1_PLATFORM_REQUIRED', 'Pin one selected native platform toolchain');
  return config.platform;
}

function qualificationReport(report, platform) {
  requireValue(object(report) && report.schema === 'plan1-native-qualification-report-v1' && report.status === 'READY' && report.comparison_status === 'NOT_RUN' && report.plan2_status === 'LOCKED' && report.platform?.kind === platform.kind && report.platform?.toolchain_id === platform.toolchain_id && /^[a-f0-9]{64}$/.test(report.toolchain_manifest_sha256) && /^[a-f0-9]{64}$/.test(report.plan_sha256) && exactTaskSet(report.tasks?.map(task => task.task_id)) && report.tasks.every(task => exactKeys(task, ['task_id', 'status', 'reason_code', 'receipts']) && task.status === 'READY' && task.reason_code === null && exactKeys(task.receipts, ['oracle', 'counterexample', 'helper']) && receipt(task.receipts.oracle, 'oracle') && receipt(task.receipts.counterexample, 'counterexample') && receipt(task.receipts.helper, 'helper')), 'PLAN1_QUALIFICATION_REQUIRED', 'Native qualification report lacks exact task receipts');
  requireValue(report.report_sha256 === digest(canonicalJSON(report.tasks)), 'PLAN1_QUALIFICATION_REQUIRED', 'Native qualification report hash differs from its receipts');
  return report;
}

/**
 * It only authorizes a separately operated comparison plan.  It deliberately
 * has no execution capability and therefore cannot start a paid comparison.
 */
export function assertPlan1LaunchAuthorized(manifests, config) {
  validatePlan1Manifests(manifests); const platform = nativePlatform(config);
  requireValue(object(config.user_review) && config.user_review.approved === true && typeof config.user_review.reviewer === 'string' && config.user_review.reviewer.length > 0 && typeof config.user_review.reviewed_at === 'string' && config.user_review.reviewed_at.length > 0, 'PLAN1_USER_REVIEW_REQUIRED', 'A named user review of the exact comparison config is required');
  requireValue(object(config.budget_approval) && typeof config.budget_approval.approval_id === 'string' && config.budget_approval.approval_id.length > 0 && /^[A-Z]{3}$/.test(config.budget_approval.currency) && Number.isSafeInteger(config.budget_approval.limit_micros) && config.budget_approval.limit_micros > 0, 'PLAN1_BUDGET_APPROVAL_REQUIRED', 'A currency-denominated approved conservative budget is required');
  requireValue(config.launch_intent?.confirmed === true, 'PLAN1_LAUNCH_INTENT_REQUIRED', 'An explicit reviewed launch intent is required');
  const report = qualificationReport(config.native_qualification_report, platform);
  const qualification = manifests['task_qualification.json'];
  requireValue(qualification.tasks.every(task => {
    const reported = report.tasks.find(item => item.task_id === task.task_id);
    return task.status === 'READY' && reported && canonicalJSON(task.oracle_receipt) === canonicalJSON(reported.receipts.oracle) && canonicalJSON(task.mutation_receipt) === canonicalJSON(reported.receipts.counterexample) && canonicalJSON(task.helper_receipt) === canonicalJSON(reported.receipts.helper);
  }), 'PLAN1_QUALIFICATION_REQUIRED', 'Every fixed task must bind its exact READY receipts from the verified native qualification report');
  const tools = manifests['tool_manifest.json']; const workflows = manifests['workflow_manifest.json']; const sessions = manifests['session_identity_audit.json'];
  requireValue(tools.platform?.kind === platform.kind && tools.platform.toolchain_id === platform.toolchain_id && tools.qualified === true && workflows.qualified === true && workflows.conversion_quality.status === 'PASS' && workflows.conversion_quality.tasks.every(task => task.status === 'PASS' && task.conversion_level === 'fully_compiled' && task.host_preflight === true && task.same_algorithm_and_resources === true) && sessions.verified === true, 'PLAN1_QUALIFICATION_REQUIRED', 'Tool, fully compiled Workflow, host preflight, equal-capability, and same-main-session qualification must use the selected exact native platform');
  return { authorized: true, action: 'comparison_plan_only', formal_comparison_status: 'NOT_RUN', platform: structuredClone(platform), manifest_sha256: digest(canonicalJSON(manifests)) };
}
