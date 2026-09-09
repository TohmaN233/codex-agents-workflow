import { readFileSync, readdirSync } from 'node:fs';

// The shipped role files are authoritative for immutable named roles.
const directory = new URL('../../agents/', import.meta.url);
const fixedRoles = new Map(readdirSync(directory).filter(name => name.endsWith('.toml')).map(name => {
  const source = readFileSync(new URL(name, directory), 'utf8');
  const field = key => source.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1];
  const role = field('name'), model = field('model'), effort = field('model_reasoning_effort');
  if (!role || !model || !effort) throw new Error(`Invalid native role definition: ${name}`);
  return [role, { model, reasoning_effort: effort }];
}));

export function nativeBindingIssue(provider) {
  if (provider?.kind !== 'native_agent') return null;
  const config = provider.config ?? {};
  const fixed = fixedRoles.get(config.agent_type);
  if (!fixed || fixed.model === config.model && fixed.reasoning_effort === config.reasoning_effort) return null;
  return { code: 'PROVIDER_ROLE_CONFIG_MISMATCH', provider_id: provider.id,
    message: `Provider ${provider.id} requests ${config.model}/${config.reasoning_effort}, but fixed role ${config.agent_type} requires ${fixed.model}/${fixed.reasoning_effort}. Use the default agent for editable model settings, or match the fixed role.`,
    agent_type: config.agent_type, expected: fixed, actual: { model: config.model, reasoning_effort: config.reasoning_effort } };
}

export function nativeSpawnConfig(provider) {
  const issue = nativeBindingIssue(provider);
  if (issue) throw Object.assign(new Error(issue.message), issue);
  const config = provider.config;
  const fixed = fixedRoles.has(config.agent_type);
  return { agent_type: config.agent_type,
    fork_turns: fixed && !config.fresh_context ? 'all' : 'none',
    ...(fixed ? {} : { model: config.model, reasoning_effort: config.reasoning_effort }) };
}
