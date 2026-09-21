import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readPlan1Manifests, assertPlan1LaunchAuthorized } from './harness.mjs';

const configPath = process.argv[2];
if (!configPath) throw Object.assign(new Error('Pass one user-reviewed launch config path; this guard never launches a comparison'), { code: 'PLAN1_LAUNCH_CONFIG_REQUIRED' });
const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
process.stdout.write(JSON.stringify(assertPlan1LaunchAuthorized(await readPlan1Manifests(), config)) + '\n');
