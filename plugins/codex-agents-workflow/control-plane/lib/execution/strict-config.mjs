import { basename, dirname, isAbsolute, join } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import { requireValue, noSymlinks } from '../workflow-paths.mjs';
import { digest } from '../workflow-revisions.mjs';

// This is the complete Windows distribution observed in the normal-session
// native image/shell proof. The older .sandbox-bin/codex.exe alone cannot run
// Code Mode host tools and must never qualify a production model node.
export const QUALIFIED_CODEX = Object.freeze({ platform: 'win32', architecture: 'x64', version: '0.158.0-alpha.2.1',
  sha256: '8f0554ede25bbc5450921897c468b2e84635aa513c5017457997af0954581f49',
  companions: Object.freeze({
    'codex-code-mode-host.exe': '4970a4ce8a7c6091a87dfea34cae03b3b95dd70f26f89f392e11de7fd8ea759e',
    'codex-command-runner.exe': 'ed216441555458ab92c5b24b53bb6b4c6346b63a658636f5e2d428dbbf70f6c5',
    'codex-windows-sandbox-setup.exe': '987d744df3c1ba4d81580a75ac28864275e8c174c3e0fa9592fb2e3e0a257e74',
  }), boundary: 'normal-app-server-native-tools' });

function keys(value, allowed, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key)), 'STRICT_CONFIG', `${label} contains unknown fields`);
}
export function validateStrictConfig(raw = {}) {
  keys(raw, ['enabled', 'codex_binary', 'binary_sha256', 'authentication', 'main_model', 'main_reasoning_effort', 'inactivity_timeout_ms'], 'Strict executor');
  const auth = raw.authentication ?? {}; keys(auth, ['mode', 'api_key_env'], 'Strict authentication');
  const result = { enabled: raw.enabled ?? false, codex_binary: raw.codex_binary ?? '', binary_sha256: raw.binary_sha256 ?? '',
    authentication: { mode: auth.mode ?? 'host_chatgpt', api_key_env: auth.api_key_env ?? '' },
    main_model: raw.main_model ?? '', main_reasoning_effort: raw.main_reasoning_effort ?? '',
    inactivity_timeout_ms: raw.inactivity_timeout_ms ?? 0 };
  requireValue(typeof result.enabled === 'boolean' && typeof result.codex_binary === 'string' && result.codex_binary.length <= 4096 &&
    (!result.codex_binary || isAbsolute(result.codex_binary)) && typeof result.binary_sha256 === 'string' &&
    (!result.binary_sha256 || /^[a-f0-9]{64}$/.test(result.binary_sha256)), 'STRICT_CONFIG', 'Strict executor needs an absolute executable and its SHA-256');
  requireValue(['host_chatgpt', 'managed_chatgpt', 'environment_api_key'].includes(result.authentication.mode) && typeof result.authentication.api_key_env === 'string' &&
    (!result.authentication.api_key_env || /^[A-Z_][A-Z0-9_]{0,127}$/.test(result.authentication.api_key_env)), 'STRICT_CONFIG', 'Authentication stores only a supported mode and environment variable name');
  requireValue(typeof result.main_model === 'string' && (!result.main_model || /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(result.main_model)) &&
    typeof result.main_reasoning_effort === 'string' && (!result.main_reasoning_effort || /^[a-z][a-z0-9_-]{0,31}$/.test(result.main_reasoning_effort)), 'STRICT_CONFIG', 'Main inherits the calling chat model and reasoning selection; explicit experiment identifiers must be valid');
  requireValue(Number.isSafeInteger(result.inactivity_timeout_ms) && result.inactivity_timeout_ms >= 0 && result.inactivity_timeout_ms <= 86_400_000,
    'STRICT_CONFIG', 'Strict inactivity_timeout_ms must be an integer from 0 through 86400000; 0 disables inactivity termination');
  requireValue(!result.enabled || result.codex_binary && result.binary_sha256 && (result.authentication.mode !== 'environment_api_key' || result.authentication.api_key_env), 'STRICT_CONFIG', 'Enabled Strict executor requires complete binary and authentication settings');
  return result;
}

async function verifiedDistributionFile(path, expectedHash, label) {
  try { await noSymlinks(path); }
  catch (error) {
    if (error.code === 'ENOENT') requireValue(false, label === 'Codex executable' ? 'CODEX_BINARY_MISSING' : 'CODEX_COMPANION_MISSING', `${label} is missing from the selected distribution: ${path}`);
    throw error;
  }
  const stat = await lstat(path);
  requireValue(stat.isFile() && stat.size > 0 && stat.size <= 512 * 1024 * 1024,
    label === 'Codex executable' ? 'CODEX_BINARY_CHANGED' : 'CODEX_COMPANION_CHANGED', `${label} is not a bounded regular file: ${path}`);
  requireValue(digest(await readFile(path)) === expectedHash,
    label === 'Codex executable' ? 'CODEX_BINARY_CHANGED' : 'CODEX_COMPANION_CHANGED', `${label} differs from the qualified distribution: ${path}`);
}

// File verification is separated from the fixed qualification gate so tests
// can exercise missing and altered package members with synthetic bytes.
export async function verifyCodexDistribution(binary, expected) {
  requireValue(basename(binary).toLowerCase() === 'codex.exe', 'CODEX_DISTRIBUTION_LAYOUT', 'Select codex.exe within its full distribution directory');
  await verifiedDistributionFile(binary, expected.sha256, 'Codex executable');
  for (const [name, hash] of Object.entries(expected.companions))
    await verifiedDistributionFile(join(dirname(binary), name), hash, name);
}

export async function qualifiedCodexBinary(settings) {
  requireValue(process.platform === QUALIFIED_CODEX.platform && process.arch === QUALIFIED_CODEX.architecture && settings.binary_sha256 === QUALIFIED_CODEX.sha256,
    'STRICT_EXECUTOR_UNQUALIFIED', 'This platform/executable has no shipped normal Codex distribution qualification');
  await verifyCodexDistribution(settings.codex_binary, QUALIFIED_CODEX);
  return settings;
}

export async function qualifiedStrictSettings(config, env = process.env) {
  const settings = validateStrictConfig(config.strict_executor);
  requireValue(settings.enabled, 'STRICT_DISABLED', 'The user has not enabled the Codex executor');
  await qualifiedCodexBinary(settings);
  requireValue(settings.authentication.mode !== 'environment_api_key' || Boolean(env[settings.authentication.api_key_env]), 'CODEX_CREDENTIAL_MISSING', 'Configured authentication environment variable is unavailable');
  return settings;
}
