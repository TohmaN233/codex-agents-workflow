import { createHash } from 'node:crypto';
import { access, copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJSON } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';
import { readPlan1Manifests } from './harness.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), { code }); };
const contained = (root, candidate) => {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

const publicTools = Object.freeze({
  'crystallographic-wyckoff-position-analysis': [
    ['environment/skills/pymatgen/scripts/structure_analyzer.py', 'public_tools/pymatgen/structure_analyzer.py'],
  ],
  'earthquake-plate-calculation': [],
  'lake-warming-attribution': [],
  'video-silence-remover': [
    ['environment/skills/audio-extractor/scripts/extract_audio.py', 'public_tools/audio-extractor/extract_audio.py'],
    ['environment/skills/energy-calculator/scripts/calc_energy.py', 'public_tools/energy-calculator/calc_energy.py'],
    ['environment/skills/silence-detector/scripts/detect_silence.py', 'public_tools/silence-detector/detect_silence.py'],
    ['environment/skills/pause-detector/scripts/detect_pauses.py', 'public_tools/pause-detector/detect_pauses.py'],
    ['environment/skills/segment-combiner/scripts/combine_segments.py', 'public_tools/segment-combiner/combine_segments.py'],
    ['environment/skills/video-processor/scripts/process_video.py', 'public_tools/video-processor/process_video.py'],
    ['environment/skills/report-generator/scripts/generate_report.py', 'public_tools/report-generator/generate_report.py'],
  ],
});

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function copyPinned(sourceRoot, targetRoot, sourceRelative, targetRelative, files) {
  const source = resolve(sourceRoot, sourceRelative);
  const target = resolve(targetRoot, targetRelative);
  requireValue(contained(sourceRoot, source), 'PLAN1_SOURCE_PATH', `Source escapes SkillsBench: ${sourceRelative}`);
  requireValue(contained(targetRoot, target), 'PLAN1_PUBLIC_PATH', `Target escapes public root: ${targetRelative}`);
  const item = await lstat(source);
  requireValue(item.isFile() && !item.isSymbolicLink(), 'PLAN1_SOURCE_FILE', `Public source must be a regular file: ${sourceRelative}`);
  const bytes = await readFile(source);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  files.push({ source: sourceRelative.replaceAll('\\', '/'), target: targetRelative.replaceAll('\\', '/'), bytes: bytes.length, sha256: digest(bytes) });
}

export async function preparePublicTaskRoots(sourceRoot, destinationRoot) {
  const source = resolve(sourceRoot);
  const destination = resolve(destinationRoot);
  requireValue(isAbsolute(source) && isAbsolute(destination), 'PLAN1_PUBLIC_ROOT', 'Source and destination roots must be absolute');
  requireValue(!(await exists(destination)), 'PLAN1_PUBLIC_ROOT_EXISTS', `Refusing to overwrite existing public root: ${destination}`);
  await mkdir(destination, { recursive: false });
  const manifests = await readPlan1Manifests();
  const tasks = [];
  for (const task of manifests['source_manifest.json'].tasks) {
    const taskSource = resolve(source, task.task_root);
    const taskTarget = resolve(destination, task.task_id);
    requireValue(contained(source, taskSource) && contained(destination, taskTarget), 'PLAN1_PUBLIC_PATH', `Task path escapes a declared root: ${task.task_id}`);
    await mkdir(taskTarget, { recursive: false });
    const files = [];
    await copyPinned(taskSource, taskTarget, 'task.md', 'task.md', files);
    for (const input of task.input_paths) {
      const taskPrefix = `${task.task_root.replaceAll('\\', '/')}/`;
      requireValue(input.startsWith(taskPrefix), 'PLAN1_INPUT_PATH', `Input is outside task root: ${input}`);
      const relativeInput = input.slice(taskPrefix.length);
      await copyPinned(taskSource, taskTarget, relativeInput, relativeInput, files);
    }
    for (const [from, to] of publicTools[task.task_id] ?? []) await copyPinned(taskSource, taskTarget, from, to, files);
    const forbidden = ['environment/skills', 'oracle', 'verifier'];
    requireValue(await Promise.all(forbidden.map(path => exists(resolve(taskTarget, path)))).then(values => values.every(value => !value)), 'PLAN1_PUBLIC_CONTAMINATION', `Forbidden source material leaked into ${task.task_id}`);
    tasks.push({ task_id: task.task_id, root: taskTarget, files: files.sort((a, b) => a.target.localeCompare(b.target)) });
  }
  const manifest = {
    schema: 'plan1-public-task-roots-v1',
    skillsbench_commit: 'b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af',
    destination,
    forbidden: ['environment/skills/**', 'oracle/**', 'verifier/**'],
    tasks,
  };
  const manifestPath = resolve(destination, 'public-task-roots.json');
  await writeFile(manifestPath, canonicalJSON(manifest));
  return { ...manifest, manifest_sha256: digest(await readFile(manifestPath)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  requireValue(process.argv.length === 4, 'PLAN1_PUBLIC_ROOT_USAGE', 'Usage: node prepare-public-task-roots.mjs <skillsbench-root> <new-public-root>');
  process.stdout.write(canonicalJSON(await preparePublicTaskRoots(process.argv[2], process.argv[3])));
}
