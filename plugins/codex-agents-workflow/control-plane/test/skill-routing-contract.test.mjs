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
  const pluginPrompt = manifest.interface.defaultPrompt[0];
  const prompt = manifest.interface.defaultPrompt.join(' ');
  const skillUi = await readFile(join(pluginRoot, 'skills', 'control-plane', 'agents', 'openai.yaml'), 'utf8');
  const skillPrompt = skillUi.match(/^\s*default_prompt:\s*"([^"]+)"\s*$/m)?.[1];

  assert.match(prompt, /only for matched execution/i);
  assert.match(prompt, /never planning, comparison, audit, or experiments/i);
  assert.ok(manifest.interface.defaultPrompt.every((value) => value.length <= 128));
  assert.equal(
    skillPrompt,
    pluginPrompt.replace('$codex-agents-workflow:workflow-control-plane', '$workflow-control-plane'),
    'the skill UI prompt must remain the namespaced plugin prompt with only its skill identifier shortened',
  );
  assert.ok(skillPrompt.length <= 128);
});
