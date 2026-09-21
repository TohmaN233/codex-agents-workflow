import test from 'node:test';
import assert from 'node:assert/strict';
import { readPlan1Manifests, validatePlan1Manifests, assertPlan1LaunchAuthorized } from './harness.mjs';

test('frozen Plan 1 templates validate as NOT_RUN and keep Plan 2 locked', async () => {
  const manifests = await readPlan1Manifests(); const result = validatePlan1Manifests(manifests);
  assert.equal(result.valid, true); assert.equal(result.comparison_status, 'NOT_RUN');
});

test('launch guard fails closed without reviewed qualification, budget approval, or native platform', async () => {
  const manifests = await readPlan1Manifests();
  assert.throws(() => assertPlan1LaunchAuthorized(manifests, { platform: { kind: 'wsl', toolchain_id: 'fixture', sandbox: 'docker' } }), { code: 'PLAN1_DOCKER_FORBIDDEN' });
  assert.throws(() => assertPlan1LaunchAuthorized(manifests, { platform: { kind: 'windows', toolchain_id: 'fixture', sandbox: 'native' }, user_review: { approved: true, reviewer: 'user', reviewed_at: '2026-09-19' }, budget_approval: { approval_id: 'approved', currency: 'USD', limit_micros: 1 }, launch_intent: { confirmed: true } }), { code: 'PLAN1_QUALIFICATION_REQUIRED' });
});
