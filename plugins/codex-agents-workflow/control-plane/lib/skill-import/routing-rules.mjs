import { requireValue } from '../workflow-paths.mjs';

export const TASK_TYPES = ['implementation', 'complex_implementation', 'review', 'planning'];
export function defaultRoutingRules(providers = []) {
  const presets = { implementation: 'native-luna', complex_implementation: 'native-terra', review: 'native-reviewer', planning: 'native-terra' };
  return { version: 1, instructions: 'Classify each agent by its responsibility. Use implementation for routine work, complex_implementation for difficult or judgment-heavy production, review for independent checking, and planning for analysis/design. Preserve separate review boundaries. Do not select Provider IDs or grant permissions.',
    routes: Object.fromEntries(TASK_TYPES.map(type => [type, { provider_id: providers.some(p => p.id === presets[type] && p.enabled) ? presets[type] : '', role: type === 'review' ? 'reviewer' : 'implementer' }])) };
}
export function validateRoutingRules(rules) {
  requireValue(rules && rules.version === 1 && typeof rules.instructions === 'string' && rules.instructions.trim() && rules.instructions.length <= 16000 && rules.routes && Object.keys(rules).every(k => ['version','instructions','routes'].includes(k)), 'ROUTING_RULES', 'Routing rules require version 1, instructions and routes');
  requireValue(Object.keys(rules.routes).length === TASK_TYPES.length && TASK_TYPES.every(t => Object.hasOwn(rules.routes,t)), 'ROUTING_RULES', 'Provide one route for every supported task type');
  for (const route of Object.values(rules.routes)) requireValue(route && Object.keys(route).every(k => ['provider_id','role'].includes(k)) && typeof route.provider_id === 'string' && route.provider_id.length <= 128 && typeof route.role === 'string' && route.role.trim() && route.role.length <= 64, 'ROUTING_RULES', 'Each route requires a Provider ID and role');
  return structuredClone(rules);
}
export function routeAgent(node, rules, providers) {
  requireValue(TASK_TYPES.includes(node.task_type) && typeof node.routing_reason === 'string' && node.routing_reason.trim() && node.routing_reason.length <= 2000, 'ROUTING_CLASSIFICATION', 'Every routed agent requires task_type and routing_reason');
  const rule = rules.routes[node.task_type];
  const provider = providers.find(p => p.id === rule.provider_id);
  requireValue(provider?.enabled && provider.capabilities?.read && (provider.kind !== 'native_agent' || ['advisor', rule.role].includes(provider.config?.role)), 'ROUTING_PROVIDER_UNAVAILABLE', `No eligible enabled Provider for ${node.task_type}; edit the routing rule`, { task_type: node.task_type, provider_id: rule.provider_id });
  return { executor: {kind:'provider',provider_id:provider.id}, role:rule.role };
}
