import test from 'node:test';
import assert from 'node:assert/strict';
import { executionEnvelope } from '../lib/workflow-execution-envelope.mjs';

test('handoff exposes pinned resource IDs, never the content-addressed object directory', () => {
  const node = { id: 'work', type: 'agent', executor: { kind: 'main' }, access: 'read_only', prompt_template: 'Inspect the source.', resources: ['source/SKILL.md'] };
  const state = { run_id: 'fixture-run', workflow_id: 'fixture', workflow_revision: 1, inputs: { task: 'Fixture' }, constraints: {}, permissions: { workspace: 'C:/fixture', access: 'read_only', allowed_paths: [] }, nodes: { work: { status: 'claimed', output: null } } };
  const pins = { root: { workflow: { skill_policy: { mode: 'cooperative', implicit: 'allow', ambient_allow: [], shadowed_skill_paths: [] }, edges: [], requirements: {} }, resources: [{ path: 'source/SKILL.md', sha256: 'a'.repeat(64), bytes: 12 }] }, providers: [], skills: [] };
  const envelope = executionEnvelope(node, state, pins, { id: 'attempt-1' }, 'lease');

  assert.equal('resources_root' in envelope, false);
  assert.deepEqual(envelope.resources, ['source/SKILL.md']);
  assert.deepEqual(envelope.resource_access, { reader: 'read_workflow_resource', paths: ['source/SKILL.md'] });
  assert.match(envelope.prompt_template, /logical identifiers, not filesystem paths/);
  assert.match(envelope.prompt_template, /Never construct a local path or Markdown file link/);
});
