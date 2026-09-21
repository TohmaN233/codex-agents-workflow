import { access } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJSON } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';
import { plan1ToolIdentity } from '../../plugins/codex-agents-workflow/control-plane/lib/execution/plan1-host-tools.mjs';
import { readPlan1Manifests } from './harness.mjs';
import { compilePlan1Fixtures, PLAN1_WORKFLOW_SPECS } from './plan1-fixture-compiler.mjs';

const requireValue = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), { code }); };
const contained = (root, candidate) => { const path = relative(root, candidate); return path === '' || (!path.startsWith('..') && !path.includes(':')); };

const commonInputSchema = {
  type: 'object',
  properties: {
    task_id: { type: 'string' }, task_root: { type: 'string' }, workspace: { type: 'string' }, action: { type: 'string' },
  },
  required: ['task_id', 'task_root', 'workspace', 'action'],
  additionalProperties: true,
};
const commonOutputSchema = {
  type: 'object',
  properties: {
    public_status: { enum: ['ready', 'passed', 'failed', 'blocked'] },
    action: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'string' }, maxItems: 64 },
  },
  required: ['public_status', 'action', 'artifacts'],
  additionalProperties: false,
};

function draftWrappers() {
  const shared = { input_schema: commonInputSchema, output_schema: commonOutputSchema, env_allow: [], output_cap_bytes: 32768, deadline_ms: 300000, idempotency: { mode: 'safe' } };
  return [
    { id: 'plan1-native-read-wrapper', identity: plan1ToolIdentity('plan1-native-read-wrapper'), argv: ['plan1-native-read-wrapper', '--public-only'], ...shared, permissions: { network: false, read_paths: ['.'], write_paths: [] } },
    { id: 'plan1-native-write-wrapper', identity: plan1ToolIdentity('plan1-native-write-wrapper'), argv: ['plan1-native-write-wrapper', '--public-only'], ...shared, permissions: { network: false, read_paths: ['.'], write_paths: ['.'] } },
  ];
}

function taskResources(task) {
  const spec = PLAN1_WORKFLOW_SPECS[task.task_id];
  requireValue(spec, 'PLAN1_WORKFLOW_SPEC', `Missing Workflow spec for ${task.task_id}`);
  requireValue(spec.resource_documents && Object.keys(spec.resource_documents).length > 0, 'PLAN1_WORKFLOW_RESOURCES', `Missing Workflow-native resources for ${task.task_id}`);
  const resources = structuredClone(spec.resource_documents);
  const serialized = canonicalJSON(resources);
  requireValue(Object.keys(resources).every(path => path.startsWith('workflow/')), 'PLAN1_WORKFLOW_RESOURCE_NAMESPACE', `Workflow resources must use only their own namespace: ${task.task_id}`);
  requireValue(!/(?:SKILL\.md|environment\/skills|source\/|source_skill|oracle|verifier)/i.test(serialized), 'PLAN1_WORKFLOW_RESOURCE_CONTAMINATION', `Source Skill or judge material leaked into Workflow resources: ${task.task_id}`);
  return resources;
}

export async function buildPlan1WorkflowPacks(sourceRoot, publicTaskRoot) {
  const manifests = await readPlan1Manifests();
  const root = resolve(sourceRoot);
  const publicRoot = resolve(publicTaskRoot);
  await access(root);
  await access(publicRoot);
  const compiled = compilePlan1Fixtures(manifests, {
    platform: {
      kind: 'windows', toolchain_id: 'plan1-draft-native-toolchain', sandbox: 'native',
      isolation: { kind: 'qualified_native_broker', id: 'draft-registration-only', network_disabled: true, independently_verified: true, evidence_sha256: '0'.repeat(64) },
    },
    wrapper_contracts: draftWrappers(),
  });
  const tasks = new Map(manifests['source_manifest.json'].tasks.map(task => [task.task_id, task]));
  const packs = [];
  for (const compiledWorkflow of compiled.workflows) {
    const taskId = compiledWorkflow.inputs_schema.properties.task_id.const;
    const task = tasks.get(taskId);
    requireValue(task, 'PLAN1_SOURCE_MANIFEST', `Compiled Workflow has no frozen task: ${taskId}`);
    const workflow = structuredClone(compiledWorkflow);
    workflow.status = 'draft';
    const publicTask = resolve(publicRoot, task.task_id);
    await access(publicTask);
    for (const forbidden of ['environment/skills', 'oracle', 'verifier']) {
      try { await access(resolve(publicTask, forbidden)); throw Object.assign(new Error(`Forbidden source material is present in public task root: ${task.task_id}/${forbidden}`), { code: 'PLAN1_PUBLIC_CONTAMINATION' }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    workflow.inputs_schema.properties.task_root.const = publicTask;
    workflow.requirements.executables = [];
    packs.push({ workflow, resources: taskResources(task) });
  }
  return { schema: 'plan1-workflow-packs-v1', comparison_status: 'NOT_RUN', packs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  requireValue(process.argv.length === 4, 'PLAN1_SOURCE_ROOT_REQUIRED', 'Usage: node build-plan1-workflow-packs.mjs <skillsbench-root> <public-task-root>');
  process.stdout.write(canonicalJSON(await buildPlan1WorkflowPacks(process.argv[2], process.argv[3])));
}
