import { readFile } from 'node:fs/promises';
import { canonicalJSON } from '../../plugins/codex-agents-workflow/control-plane/lib/workflow-revisions.mjs';
import { readPlan1Manifests } from './harness.mjs';
import { compilePlan1Fixtures } from './plan1-fixture-compiler.mjs';
import { runNativeQualification } from './native-qualification-runner.mjs';

const [operation, configPath] = process.argv.slice(2);
if (!['compile', 'qualify'].includes(operation) || !configPath) throw Object.assign(new Error('Usage: node plan1-native-cli.mjs <compile|qualify> <native-config.json>'), { code: 'PLAN1_CLI_USAGE' });
const config = JSON.parse(await readFile(configPath, 'utf8')); const manifests = await readPlan1Manifests();
const result = operation === 'compile'
  ? compilePlan1Fixtures(manifests, { platform: config.platform, wrapper_contract: config.wrapper_contract })
  : await runNativeQualification(manifests, config);
process.stdout.write(canonicalJSON(result) + '\n');
