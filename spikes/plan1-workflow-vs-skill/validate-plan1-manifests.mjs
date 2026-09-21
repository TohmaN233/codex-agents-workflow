import { readPlan1Manifests, validatePlan1Manifests } from './harness.mjs';

const result = validatePlan1Manifests(await readPlan1Manifests());
process.stdout.write(JSON.stringify(result) + '\n');
