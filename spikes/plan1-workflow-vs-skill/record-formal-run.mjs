import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJSON } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';

const allowed = new Set(['thread_id', 'host_id', 'status', 'dispatched_at', 'completed_at', 'turn_id', 'session_log', 'usage', 'contamination_audit', 'judge', 'error', 'launch_attempts', 'workspace']);
const requireValue = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), { code }); };

export async function recordFormalRun(manifestPath, runId, update) {
  requireValue(update && typeof update === 'object' && !Array.isArray(update) && Object.keys(update).length > 0 && Object.keys(update).every(key => allowed.has(key)), 'PLAN1_RUN_UPDATE', 'Run update contains no fields or unsupported fields');
  const path = resolve(manifestPath);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  requireValue(['plan1-formal-comparison-v1', 'plan1-formal-comparison-v2'].includes(manifest.schema) && Array.isArray(manifest.schedule), 'PLAN1_RUN_MANIFEST', 'Formal comparison manifest is invalid');
  const run = manifest.schedule.find(item => item.run_id === runId);
  requireValue(run, 'PLAN1_RUN_ID', `Unknown formal run: ${runId}`);
  if (update.thread_id !== undefined) {
    const clearingFailedLaunch = update.thread_id === null && update.status === 'PLANNED' && Array.isArray(update.launch_attempts) && update.launch_attempts.length > 0;
    requireValue(clearingFailedLaunch || run.thread_id === null || run.thread_id === update.thread_id, 'PLAN1_THREAD_ID', `Run already belongs to another task: ${runId}`);
  }
  Object.assign(run, update);
  const terminal = new Set(['COMPLETED', 'FAILED', 'INVALID_CONTAMINATION', 'CANCELLED']);
  const counts = Object.fromEntries(['PLANNED', 'DISPATCHED', 'RUNNING', ...terminal].map(status => [status, manifest.schedule.filter(item => item.status === status).length]));
  manifest.status = manifest.schedule.every(item => terminal.has(item.status)) ? 'TERMINAL' : manifest.schedule.some(item => item.status !== 'PLANNED') ? 'RUNNING' : 'PREPARED_NOT_STARTED';
  manifest.status_counts = counts;
  const temporary = `${path}.write-${process.pid}`;
  await writeFile(temporary, canonicalJSON(manifest));
  await rename(temporary, path);
  return { run_id: runId, status: run.status, thread_id: run.thread_id, manifest_status: manifest.status, status_counts: counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  requireValue(process.argv.length === 4, 'PLAN1_RUN_UPDATE_USAGE', 'Usage: node record-formal-run.mjs <manifest> <run-id>');
  const update = JSON.parse(process.env.PLAN1_RUN_UPDATE ?? '{}');
  process.stdout.write(canonicalJSON(await recordFormalRun(process.argv[2], process.argv[3], update)));
}
