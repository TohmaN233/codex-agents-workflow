import { createHash } from 'node:crypto';
import { access, cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJSON } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';
import { PLAN1_ARMS, PLAN1_TASK_IDS } from './harness.mjs';

const SEED = 'plan1-formal-v1-terra-medium-2026-09-20';
const digest = value => createHash('sha256').update(value).digest('hex');
const requireValue = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), { code }); };
const contained = (root, candidate) => {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};
async function exists(path) { try { await access(path); return true; } catch { return false; } }

async function filesUnder(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    requireValue(contained(root, path), 'PLAN1_PACKET_ESCAPE', `Packet path escapes root: ${path}`);
    if (entry.isSymbolicLink()) throw Object.assign(new Error(`Symbolic links are forbidden in arm packets: ${path}`), { code: 'PLAN1_PACKET_LINK' });
    if (entry.isDirectory()) result.push(...await filesUnder(root, path));
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      result.push({ path: relative(root, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: digest(bytes) });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function taskShort(taskId) {
  return ({
    'crystallographic-wyckoff-position-analysis': 'crystal',
    'earthquake-plate-calculation': 'quake',
    'lake-warming-attribution': 'lake',
    'video-silence-remover': 'video',
  })[taskId];
}

export async function prepareFormalComparison(skillsbenchRoot, publicTaskRoot, destinationRoot, revisions) {
  const source = resolve(skillsbenchRoot);
  const publicRoot = resolve(publicTaskRoot);
  const destination = resolve(destinationRoot);
  requireValue([source, publicRoot, destination].every(isAbsolute), 'PLAN1_FORMAL_ROOT', 'All comparison roots must be absolute');
  requireValue(!(await exists(destination)), 'PLAN1_FORMAL_ROOT_EXISTS', `Refusing to overwrite comparison root: ${destination}`);
  requireValue(PLAN1_TASK_IDS.every(taskId => typeof revisions[taskId] === 'string' && /^[a-f0-9]{64}$/.test(revisions[taskId])), 'PLAN1_WORKFLOW_REVISIONS', 'Every task needs one published revision hash');
  await mkdir(destination, { recursive: false });

  const skillPackets = [];
  const packetRoot = resolve(destination, 'skill-packets');
  await mkdir(packetRoot);
  for (const taskId of PLAN1_TASK_IDS) {
    const from = resolve(source, 'tasks', taskId, 'environment', 'skills');
    const to = resolve(packetRoot, taskId, 'environment', 'skills');
    requireValue(contained(source, from) && contained(destination, to), 'PLAN1_PACKET_ESCAPE', `Skill packet escapes a declared root: ${taskId}`);
    const item = await lstat(from);
    requireValue(item.isDirectory() && !item.isSymbolicLink(), 'PLAN1_SKILL_PACKET', `Missing regular Skill directory: ${taskId}`);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: false });
    const files = await filesUnder(resolve(packetRoot, taskId));
    requireValue(files.some(file => /(?:^|\/)SKILL\.md$/.test(file.path)), 'PLAN1_SKILL_PACKET', `Skill packet has no SKILL.md: ${taskId}`);
    requireValue(!files.some(file => /(?:^|\/)(?:oracle|verifier)(?:\/|$)/i.test(file.path)), 'PLAN1_SKILL_PACKET_CONTAMINATION', `Judge material leaked into Skill packet: ${taskId}`);
    skillPackets.push({ task_id: taskId, root: resolve(packetRoot, taskId), files });
  }

  const runsRoot = resolve(destination, 'runs');
  await mkdir(runsRoot);
  const schedule = [];
  let sequence = 0;
  for (const taskId of PLAN1_TASK_IDS) for (let repeat = 1; repeat <= 3; repeat += 1) {
    const repeatedArms = repeat === 1 ? PLAN1_ARMS : PLAN1_ARMS.filter(arm => arm !== 'W-control');
    const orderedArms = [...repeatedArms].sort((a, b) => digest(`${SEED}\0${taskId}\0${repeat}\0${a}`).localeCompare(digest(`${SEED}\0${taskId}\0${repeat}\0${b}`)));
    for (const arm of orderedArms) {
      sequence += 1;
      const runId = `p1-${String(sequence).padStart(2, '0')}-${taskShort(taskId)}-${arm.toLowerCase()}-r${repeat}`;
      const runRoot = resolve(runsRoot, runId);
      const workspace = resolve(runRoot, 'workspace');
      await mkdir(workspace, { recursive: true });
      schedule.push({
        sequence, run_id: runId, task_id: taskId, arm, repeat,
        model: 'gpt-5.6-terra', thinking: 'medium',
        public_task_root: resolve(publicRoot, taskId),
        skill_packet_root: arm === 'S-main' ? resolve(packetRoot, taskId) : null,
        workflow_id: arm.startsWith('W-') ? `plan1-${taskId}` : null,
        workflow_revision: arm.startsWith('W-') ? revisions[taskId] : null,
        workspace, thread_id: null, status: 'PLANNED',
      });
    }
  }
  requireValue(schedule.length === 40 && new Set(schedule.map(run => run.workspace)).size === 40, 'PLAN1_SCHEDULE', 'Formal schedule must contain 40 isolated workspaces');
  const manifest = {
    schema: 'plan1-formal-comparison-v2', status: 'PREPARED_NOT_STARTED', seed: SEED,
    model: 'gpt-5.6-terra', thinking: 'medium',
    isolation: {
      fresh_thread_per_run: true,
      workspace_per_run: true,
      public_root_has_no_skill_or_judge: true,
      N_main_resources: ['public_task_root'],
      S_main_resources: ['public_task_root', 'skill_packet_root'],
      W_control_resources: ['public_task_root', 'complete_workflow_native_bundle'],
      W_main_resources: ['public_task_root', 'node_declared_workflow_native_resources'],
      cross_arm_session_log_audit: 'required',
    },
    thread_dispatch_gate: { explicit_thread_request: true, native_subagents: 'available', spawn_requirement: 'required', fallback_mode: 'none' },
    intent_contract: { goal: 'Run the frozen four-task Workflow-vs-Skill comparison', non_goals: ['universal Skill claims', 'Docker', 'network during task', 'cross-arm resource access'], done_when: '40 terminal runs are judged, tokened, and contamination-audited', merge_policy: 'no_merge', data_collection: 'local_jsonl', max_items: 40, queue_tranche: 1 },
    skill_packets: skillPackets,
    schedule,
  };
  const path = resolve(destination, 'formal-comparison.json');
  await writeFile(path, canonicalJSON(manifest));
  return { path, manifest_sha256: digest(await readFile(path)), runs: schedule.length, first_tranche: schedule.slice(0, 1) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  requireValue(process.argv.length === 5, 'PLAN1_FORMAL_USAGE', 'Usage: node prepare-formal-comparison.mjs <skillsbench-root> <public-task-root> <new-destination-root>');
  const revisions = JSON.parse(process.env.PLAN1_WORKFLOW_REVISIONS ?? '{}');
  process.stdout.write(canonicalJSON(await prepareFormalComparison(process.argv[2], process.argv[3], process.argv[4], revisions)));
}
