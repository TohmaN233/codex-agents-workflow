import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('workflow-control-plane reserves Runs for concrete execution intent', async () => {
  const skill = await readFile(join(pluginRoot, 'skills', 'control-plane', 'SKILL.md'), 'utf8');

  assert.match(skill, /Only\s+this mode may start a Run\./);
  assert.match(skill, /planning, comparing, evaluating, auditing, or\s+designing experiments/i);
  assert.match(skill, /plugin mention exposes these capabilities; it is not authorization to start a\s+Run/i);
  assert.match(skill, /Discussion of conversion, trigger design, or\s+Skill-versus-Workflow experiments is Meta work/i);
  assert.match(skill, /Do not select by keyword overlap alone\./);
  assert.match(skill, /exact Ready Workflow ID and revision have already been supplied for a\s+compact main run/i);
  assert.match(skill, /do not call `workflow_list`, `workflow_capabilities`,\s+`codex_agents_workflow_status`, or `workflow_read`/i);
  assert.match(skill, /application host, not the model, owns launch and completion/i);
  assert.match(skill, /`workflow_begin_main` and `workflow_complete_main` are host-only APIs/i);
  assert.match(skill, /do not emit\s+an `accepted` field/i);
});

test('plugin defaults do not turn planning or audit prompts into Runs', async () => {
  const manifest = JSON.parse(await readFile(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  const prompt = manifest.interface.defaultPrompt.join(' ');

  assert.match(prompt, /only when it directly matches a concrete execution task/i);
  assert.match(prompt, /planning, comparison, audit, and experiment design do not start Runs/i);
});
