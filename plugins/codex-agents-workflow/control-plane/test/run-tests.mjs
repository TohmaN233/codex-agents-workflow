#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const files = [
  'i18n.test.mjs',
  'thread-protocol.test.mjs',
  'thread-handoff.test.mjs',
  'thread-source-options.test.mjs',
  'execution-envelope-resources.test.mjs',
  'workflow-presets.test.mjs',
  'native-binding.test.mjs',
  'config.test.mjs',
  'local-client-discovery.test.mjs',
  'generation-progress.test.mjs',
  'review-checklist.test.mjs',
  'connector-integration.test.mjs',
  'connectors.test.mjs',
  'connector-process.test.mjs',
  'run-refresh.test.mjs',
  'launch-edited-workflow.test.mjs',
  'cache-cleanup.test.mjs',
  'task-inputs.test.mjs',
  'console.test.mjs',
  'mcp.test.mjs',
  'conversation-control-recovery.test.mjs',
  'mcp-startup.test.mjs',
  'plugin-bootstrap.test.mjs',
  'run-absolute-scope.test.mjs',
  'runtime-dependency-boundary.test.mjs',
  'runtime-environment.test.mjs',
  'open-console.test.mjs',
  'providers.test.mjs',
  'workflow-store.test.mjs',
  'workflow-editor.test.mjs',
  'workflow-validator.test.mjs',
  'workflow-migration.test.mjs',
  'workflow-runtime.test.mjs',
  'workflow-pins.test.mjs',
  'workflow-subworkflow.test.mjs',
  'parallel-planner.test.mjs',
  'parallel-worktrees.test.mjs',
  'parallel-runtime.test.mjs',
  'workflow-service.test.mjs',
  'strict-execution.test.mjs',
  'codex-tool-broker.test.mjs',
  'codex-managed-login.test.mjs',
  'codex-model-catalog.test.mjs',
  'codex-host-auth.test.mjs',
  'codex-auth-rpc.test.mjs',
  'strict-manager.test.mjs',
  'strict-session-view.test.mjs',
  'display-data.test.mjs',
  'skill-import.test.mjs',
].map((name) => join(root, name));

const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  stdio: 'inherit',
  windowsHide: true,
  env: process.env,
});
child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) console.error(`test runner terminated by ${signal}`);
  process.exitCode = Number.isInteger(code) ? code : 1;
});
