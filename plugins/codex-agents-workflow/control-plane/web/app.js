import { getLocale, setLocale, subscribeLocale, t } from './i18n.js';
import { isMcpAppContext, isMcpAppResource, requestMcpApp, setAppView, token } from './app-client.js';
import { createSettingsViewState } from './settings-view-state.js';
import { confirmWorkbench } from './app-client.js';

let settingsRoot = document;
const mountedRoots = new WeakSet();
const settingsViewState = createSettingsViewState();

const state = { config: null, savedConfig: null, bundledDefaults: null, revision: '', storage: null, dirty: false, modelCatalog: [], modelCatalogError: '', providerSecrets: {}, providerSecretsError: '' };
const $ = (selector, root = settingsRoot) => root.querySelector(selector);
const $$ = (selector, root = settingsRoot) => [...root.querySelectorAll(selector)];
const copy = (zh, en = zh) => ({ zh, en });
const asCopy = (value) => (value && typeof value === 'object' && 'zh' in value && 'en' in value)
  ? value
  : copy(String(value));

function setLocalizedText(element, zh, en = zh) {
  if (!element) return;
  element.dataset.i18nZh = zh;
  element.dataset.i18nEn = en;
  element.textContent = t(zh, en);
}

function clearLocalizedText(element) {
  if (!element) return;
  delete element.dataset.i18nZh;
  delete element.dataset.i18nEn;
}

function uniqueProviderId(base) {
  const existing = new Set($$('.provider-id').map((input) => input.value.trim()).filter(Boolean));
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function applyLocalizedText(element) {
  if (!element?.dataset.i18nZh || !element?.dataset.i18nEn) return;
  const value = t(element.dataset.i18nZh, element.dataset.i18nEn);
  if (element.dataset.i18nAttr) element.setAttribute(element.dataset.i18nAttr, value);
  else element.textContent = value;
}

function applyStaticTranslations() {
  $$('[data-i18n-zh][data-i18n-en]').forEach(applyLocalizedText);
}

function localizedValue(value) {
  const item = asCopy(value);
  return t(item.zh, item.en);
}

function optionLabel(value, labels = {}) {
  return labels[value] || value;
}

const PROVIDER_KIND_LABELS = {
  native_agent: copy('原生 Agent', 'Native agent'),
  builtin_connector: copy('内置连接器', 'Built-in connector'),
  external_mcp: copy('外部 MCP', 'External MCP'),
  web_review: copy('网页审阅', 'Web review'),
  openai_compatible: copy('OpenAI 兼容', 'OpenAI-compatible'),
};
const ACCESS_LABELS = {
  read_only: copy('只读', 'Read only'),
  bounded_write: copy('受限写入', 'Bounded write'),
};
const REASONING_EFFORT_LABELS = {
  '': copy('默认', '(default)'),
  low: copy('低', 'low'),
  medium: copy('中', 'medium'),
  high: copy('高', 'high'),
  xhigh: copy('极高', 'xhigh'),
  max: copy('最大', 'max'),
  ultra: copy('超高', 'ultra'),
};
const ROUTE_LABELS = {
  solo: copy('单节点', 'solo'),
  delegate: copy('委派', 'delegate'),
  audit: copy('审阅', 'audit'),
  full: copy('完整流程', 'full'),
  invalid: copy('无效', 'invalid'),
};

function localizedRoute(route) {
  return localizedValue(ROUTE_LABELS[route] || copy(route));
}

function setLocalizedOrUserText(element, value, zhFallback, enFallback) {
  if (value) {
    clearLocalizedText(element);
    element.textContent = value;
  } else {
    setLocalizedText(element, zhFallback, enFallback);
  }
}

function toast(message, error = false) {
  const el = $('#toast');
  const messageCopy = asCopy(message);
  setLocalizedText(el, messageCopy.zh, messageCopy.en);
  el.className = `show${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = ''; }, 3200);
}

async function api(path, options = {}) {
  if (isMcpAppContext) {
    const method = options.method || (options.body === undefined ? 'GET' : 'POST');
    let body;
    if (options.body !== undefined) body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    return requestMcpApp({ path, method, ...(body === undefined ? {} : { body }) });
  }
  if (!token) throw new Error(t('此页面没有控制台凭据。请从 Codex Agents Workflow 重新打开控制台。', 'Console token is missing. Reopen the console from Codex Agents Workflow.'));
  const response = await fetch(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function field(labelText, input) {
  const label = document.createElement('label');
  const span = document.createElement('span');
  const labelCopy = asCopy(labelText);
  setLocalizedText(span, labelCopy.zh, labelCopy.en);
  label.append(span, input);
  return label;
}

function textInput(value = '', className = '') {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.className = className;
  input.addEventListener('input', markDirty);
  return input;
}

function checkbox(value = false, className = '') {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(value);
  input.className = className;
  input.addEventListener('change', markDirty);
  return input;
}

function selectInput(values, current, className = '', labels = {}) {
  const select = document.createElement('select');
  select.className = className;
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    const label = asCopy(optionLabel(value, labels));
    setLocalizedText(option, label.zh, label.en);
    option.selected = value === current;
    select.append(option);
  }
  select.addEventListener('change', markDirty);
  return select;
}

function textarea(value = '', className = '') {
  const input = document.createElement('textarea');
  input.value = value;
  input.className = className;
  input.addEventListener('input', markDirty);
  return input;
}

function passwordInput(className = '') {
  const input = document.createElement('input');
  input.type = 'password';
  input.autocomplete = 'off';
  input.className = className;
  return input;
}

function catalogModel(modelId) {
  return state.modelCatalog.find((item) => item.model === modelId);
}

function modelDisplayName(modelId) {
  const item = catalogModel(modelId);
  return item?.displayName ? `${item.displayName} · ${item.model}` : modelId;
}

function nativeModelSelect(current) {
  const select = document.createElement('select');
  select.className = 'provider-model';
  const ids = [...new Set([...state.modelCatalog.map((item) => item.model), current].filter(Boolean))];
  for (const modelId of ids) {
    const option = document.createElement('option');
    option.value = modelId;
    option.textContent = modelDisplayName(modelId);
    option.selected = modelId === current;
    select.append(option);
  }
  select.addEventListener('change', markDirty);
  return select;
}

function reasoningEfforts(modelId, current) {
  const item = catalogModel(modelId);
  const advertised = (item?.supportedReasoningEfforts || []).map((entry) => entry.reasoningEffort).filter(Boolean);
  return [...new Set([...(advertised.length ? advertised : ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']), current].filter(Boolean))];
}

function replaceReasoningOptions(select, modelId, preferred) {
  const values = reasoningEfforts(modelId, preferred);
  const model = catalogModel(modelId);
  const selected = values.includes(preferred) ? preferred : (model?.defaultReasoningEffort || values[0] || '');
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = localizedValue(REASONING_EFFORT_LABELS[value] || copy(value));
    option.selected = value === selected;
    return option;
  }));
}

function secretState(providerId) {
  return state.providerSecrets[providerId] || { required: true, ready: false };
}

function grid(...children) {
  const el = document.createElement('div');
  el.className = 'grid two';
  el.append(...children);
  return el;
}

function markDirty() {
  state.dirty = true;
  setBadge(copy('未保存', 'Unsaved'), '');
}

function setBadge(text, kind = '') {
  const badge = $('#status-badge');
  const badgeCopy = asCopy(text);
  setLocalizedText(badge, badgeCopy.zh, badgeCopy.en);
  badge.className = `badge${kind ? ` ${kind}` : ''}`;
}

function providerCard(provider, index) {
  const details = document.createElement('details');
  details.className = 'card provider-card';
  details.dataset.index = String(index);
  details.dataset.role = provider.config?.role || '';
  const summary = document.createElement('summary');
  const title = document.createElement('span');
  const meta = document.createElement('span');
  meta.className = 'card-meta';
  summary.append(title, meta);

  const body = document.createElement('div');
  body.className = 'card-body';
  const id = textInput(provider.id, 'provider-id');
  id.addEventListener('input', refreshProviderOptions);
  const name = textInput(provider.name, 'provider-name');
  const kind = selectInput(
    ['native_agent', 'builtin_connector', 'external_mcp', 'web_review', 'openai_compatible'],
    provider.kind,
    'provider-kind',
    PROVIDER_KIND_LABELS,
  );
  const enabled = checkbox(provider.enabled, 'provider-enabled');
  const approval = checkbox(provider.requires_user_approval, 'provider-approval');
  const read = checkbox(provider.capabilities?.read, 'provider-read');
  const write = checkbox(provider.capabilities?.write, 'provider-write');
  const background = checkbox(provider.capabilities?.background, 'provider-background');
  const description = textarea(provider.description, 'provider-description');
  const config = textarea(JSON.stringify(provider.config, null, 2), 'provider-config');
  const nativeOptions = document.createElement('div');
  nativeOptions.className = 'grid two provider-native-options';
  const model = nativeModelSelect(provider.config?.model || '');
  const currentEffort = provider.config?.reasoning_effort || '';
  const effortOptions = reasoningEfforts(model.value, currentEffort);
  const reasoningEffort = selectInput(
    effortOptions,
    currentEffort,
    'provider-reasoning-effort',
    REASONING_EFFORT_LABELS,
  );
  replaceReasoningOptions(reasoningEffort, model.value, currentEffort);
  nativeOptions.append(
    field(copy('可用模型', 'Available model'), model),
    field(copy('推理强度', 'Reasoning effort'), reasoningEffort),
  );

  const apiOptions = document.createElement('div');
  apiOptions.className = 'stack provider-api-options';
  const apiEndpoint = textInput(provider.config?.endpoint || '', 'provider-api-endpoint');
  const apiModel = textInput(provider.config?.model || '', 'provider-api-model');
  const apiAuth = selectInput(['bearer', 'x-api-key', 'none'], provider.config?.auth_type || 'bearer', 'provider-api-auth');
  const apiKeyEnv = textInput(provider.config?.api_key_env || '', 'provider-api-key-env');
  const apiKey = passwordInput('provider-api-key');
  apiKey.addEventListener('input', markDirty);
  apiKey.placeholder = t('粘贴 API key；保存后从输入框清除', 'Paste API key; cleared from this field after save');
  const apiKeyStatus = document.createElement('p');
  apiKeyStatus.className = 'hint provider-secret-status';
  const clearSecret = document.createElement('button');
  clearSecret.type = 'button';
  clearSecret.className = 'secondary small';
  setLocalizedText(clearSecret, '清除本次会话的 API key', 'Clear API key for this session');
  const apiGrid = grid(
    field(copy('API 地址', 'API endpoint'), apiEndpoint),
    field(copy('模型 ID', 'Model id'), apiModel),
    field(copy('认证方式', 'Authentication'), apiAuth),
    field(copy('API key 环境变量名', 'API key environment variable'), apiKeyEnv),
  );
  apiOptions.append(apiGrid, field(copy('API key（仅当前会话）', 'API key (current session only)'), apiKey), apiKeyStatus, clearSecret);

  const advanced = document.createElement('details');
  advanced.className = 'provider-advanced';
  const advancedSummary = document.createElement('summary');
  setLocalizedText(advancedSummary, '高级适配器设置', 'Advanced adapter settings');
  advanced.append(advancedSummary, field(copy('适配器 JSON（禁止填写密钥）', 'Adapter JSON (never enter secrets)'), config));

  const refreshProviderSummary = () => {
    clearLocalizedText(title);
    if (kind.value === 'native_agent' && model.value) title.textContent = `${modelDisplayName(model.value)} / ${reasoningEffort.value}`;
    else if (kind.value === 'openai_compatible' && apiModel.value) title.textContent = apiModel.value;
    else setLocalizedOrUserText(title, name.value, '未命名 Provider', '(unnamed provider)');
    const kindCopy = asCopy(PROVIDER_KIND_LABELS[kind.value] || kind.value);
    setLocalizedText(
      meta,
      `${name.value || '未命名'} · ${kindCopy.zh} · ${enabled.checked ? '已启用' : '已停用'}`,
      `${name.value || '(unnamed)'} · ${kindCopy.en} · ${enabled.checked ? 'enabled' : 'disabled'}`,
    );
  };
  name.addEventListener('input', refreshProviderSummary);
  enabled.addEventListener('change', refreshProviderSummary);

  const syncVisibility = () => {
    nativeOptions.hidden = kind.value !== 'native_agent';
    apiOptions.hidden = kind.value !== 'openai_compatible';
  };
  const parsedConfig = () => {
    try { return JSON.parse(config.value); } catch { return null; }
  };
  const writeParsedConfig = (parsed) => {
    config.value = JSON.stringify(parsed, null, 2);
    markDirty();
  };
  const syncNativeConfig = () => {
    if (kind.value !== 'native_agent') return;
    const parsed = parsedConfig();
    if (!parsed) return;
    parsed.model = model.value.trim();
    parsed.reasoning_effort = reasoningEffort.value;
    parsed.role ||= 'advisor';
    details.dataset.role = parsed.role;
    writeParsedConfig(parsed);
    refreshProviderSummary();
    refreshProviderOptions();
  };
  const syncNativeFields = () => {
    if (kind.value !== 'native_agent') return;
    const parsed = parsedConfig();
    if (!parsed) return;
    if (typeof parsed.model === 'string' && [...model.options].some((option) => option.value === parsed.model)) model.value = parsed.model;
    replaceReasoningOptions(reasoningEffort, model.value, parsed.reasoning_effort);
    details.dataset.role = parsed.role || 'advisor';
  };
  const syncApiConfig = () => {
    if (kind.value !== 'openai_compatible') return;
    const parsed = parsedConfig();
    if (!parsed) return;
    parsed.endpoint = apiEndpoint.value.trim();
    parsed.model = apiModel.value.trim();
    parsed.auth_type = apiAuth.value;
    parsed.api_key_env = apiAuth.value === 'none' ? '' : apiKeyEnv.value.trim();
    writeParsedConfig(parsed);
    refreshProviderSummary();
  };
  const syncApiFields = () => {
    if (kind.value !== 'openai_compatible') return;
    const parsed = parsedConfig();
    if (!parsed) return;
    apiEndpoint.value = parsed.endpoint || '';
    apiModel.value = parsed.model || '';
    apiAuth.value = parsed.auth_type || 'bearer';
    apiKeyEnv.value = parsed.api_key_env || '';
  };
  const refreshSecretStatus = () => {
    const current = secretState(id.value.trim());
    if (apiAuth.value === 'none') setLocalizedText(apiKeyStatus, '此 Provider 不需要 API key。', 'This Provider does not require an API key.');
    else if (apiKey.value) setLocalizedText(apiKeyStatus, '保存配置时载入此 key；不会写入磁盘。', 'This key will be loaded on save and will not be written to disk.');
    else if (current.ready) setLocalizedText(apiKeyStatus, `当前会话已载入 ${apiKeyEnv.value || current.api_key_env}。`, `${apiKeyEnv.value || current.api_key_env} is loaded for this session.`);
    else setLocalizedText(apiKeyStatus, `尚未载入 ${apiKeyEnv.value || current.api_key_env || 'API key'}。`, `${apiKeyEnv.value || current.api_key_env || 'API key'} is not loaded.`);
    clearSecret.hidden = apiAuth.value === 'none' || !current.ready;
  };
  const resetConfigForKind = () => {
    const current = parsedConfig() || {};
    if (kind.value === 'native_agent' && (!current.agent_type || !current.role)) {
      const firstModel = state.modelCatalog[0]?.model || 'gpt-6-luna';
      config.value = JSON.stringify({ agent_type: 'default', model: firstModel, reasoning_effort: catalogModel(firstModel)?.defaultReasoningEffort || 'medium', role: 'advisor', fresh_context: true, requested_sandbox: 'workspace-write', inactivity_timeout_ms: 0 }, null, 2);
      syncNativeFields();
    } else if (kind.value === 'openai_compatible' && !current.endpoint) {
      config.value = JSON.stringify({ endpoint: 'https://api.openai.com/v1/chat/completions', model: '', api_key_env: `CODEX_WORKFLOW_${id.value.trim().replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_API_KEY`, auth_type: 'bearer', timeout_ms: 120000, max_output_tokens: 4096, max_tokens_field: 'max_tokens', temperature: 0.2, system_prompt: '', headers: {} }, null, 2);
      syncApiFields();
    }
    syncVisibility();
    refreshSecretStatus();
    refreshProviderSummary();
  };
  model.addEventListener('change', () => { replaceReasoningOptions(reasoningEffort, model.value, catalogModel(model.value)?.defaultReasoningEffort || reasoningEffort.value); syncNativeConfig(); });
  reasoningEffort.addEventListener('change', syncNativeConfig);
  for (const input of [apiEndpoint, apiModel, apiKeyEnv]) input.addEventListener('input', syncApiConfig);
  apiAuth.addEventListener('change', () => { syncApiConfig(); refreshSecretStatus(); });
  apiKey.addEventListener('input', () => { markDirty(); refreshSecretStatus(); });
  clearSecret.addEventListener('click', () => api('/api/provider-secret', { method: 'PUT', body: JSON.stringify({ provider_id: id.value.trim(), clear: true }) }).then((result) => {
    state.providerSecrets[result.provider_id] = result;
    apiKey.value = '';
    refreshSecretStatus();
    toast(copy('本次会话的 API key 已清除。', 'API key cleared for this session.'));
  }).catch((error) => toast(error.message, true)));
  config.addEventListener('input', () => { syncNativeFields(); syncApiFields(); refreshProviderSummary(); });
  kind.addEventListener('change', resetConfigForKind);
  id.addEventListener('input', refreshSecretStatus);
  syncVisibility();
  refreshSecretStatus();

  const toggles = document.createElement('div');
  toggles.className = 'grid three';
  toggles.append(
    field(copy('已启用', 'Enabled'), enabled),
    field(copy('每次使用 Provider 前询问', 'Ask before every Provider use'), approval),
    field(copy('读取能力', 'Read capability'), read),
    field(copy('写入能力', 'Write capability'), write),
    field(copy('后台能力', 'Background capability'), background),
  );
  body.append(
    grid(field(copy('Provider ID', 'Provider id'), id), field(copy('显示名称', 'Display name'), name)),
    grid(field(copy('类型', 'Kind'), kind), document.createElement('span')),
    toggles,
    field(copy('描述', 'Description'), description),
    nativeOptions,
    apiOptions,
    advanced,
  );

  const actions = document.createElement('div');
  actions.className = 'actions';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger small';
  setLocalizedText(remove, '移除 Provider', 'Remove provider');
  remove.addEventListener('click', () => {
    details.remove();
    markDirty();
    refreshProviderOptions();
  });
  actions.append(remove);
  body.append(actions);
  details.append(summary, body);
  refreshProviderSummary();
  return details;
}

const ROUTE_STAGES = {
  solo: [],
  delegate: [{ id: 'implementation', role: 'implementer' }],
  audit: [{ id: 'review', role: 'reviewer' }],
  full: [{ id: 'implementation', role: 'implementer' }, { id: 'review', role: 'reviewer' }],
};

function stageEditor(stage) {
  const section = document.createElement('section');
  section.className = 'stage-card';
  section.dataset.stageId = stage.id;
  section.dataset.role = stage.role;
  const heading = document.createElement('h3');
  const roleHeading = stage.role === 'implementer'
    ? copy('实施阶段', 'Implementation stage')
    : copy('审阅阶段', 'Review stage');
  setLocalizedText(heading, roleHeading.zh, roleHeading.en);
  const provider = document.createElement('select');
  provider.className = 'stage-provider';
  provider.dataset.current = stage.provider_id || '';
  provider.addEventListener('change', markDirty);
  const access = selectInput(
    ['read_only', 'bounded_write'],
    stage.access || 'read_only',
    'stage-access',
    ACCESS_LABELS,
  );
  const approval = checkbox(stage.requires_user_approval, 'stage-approval');
  const template = textarea(stage.template || 'Perform {{task}} under {{constraints}}. Verify with {{verification}}.', 'stage-template template');
  const approvalHint = document.createElement('p');
  approvalHint.className = 'hint';
  setLocalizedText(
    approvalHint,
    '勾选此阶段或其 Provider 时会要求额外确认。两者都关闭即可不再显示额外的模型调用提示。',
    'Extra confirmation is requested when either this Stage or its Provider is checked. Leave both off for no additional model-call prompt.',
  );
  access.addEventListener('change', refreshProviderOptions);
  section.append(
    heading,
    grid(field(copy('固定 Provider', 'Pinned provider'), provider), field(copy('访问权限', 'Access'), access)),
    field(copy('此阶段运行前询问', 'Ask before this Stage'), approval),
    approvalHint,
    field(copy('私有阶段提示模板', 'Private stage prompt template'), template),
  );
  return section;
}

function currentStages(card) {
  return $$('.stage-card', card).map((stage) => ({
    id: stage.dataset.stageId,
    role: stage.dataset.role,
    provider_id: $('.stage-provider', stage).value,
    access: $('.stage-access', stage).value,
    requires_user_approval: $('.stage-approval', stage).checked,
    template: $('.stage-template', stage).value,
  }));
}

function taskTypeFromCard(card) {
  return {
    id: $('.task-type-id', card).value.trim(),
    name: $('.task-type-name', card).value.trim(),
    enabled: $('.task-type-enabled', card).checked,
    description: $('.task-type-description', card).value,
    tags: $('.task-type-tags', card).value.split(',').map((value) => value.trim()).filter(Boolean),
    stages: currentStages(card),
  };
}

function routeForStages(stages) {
  const ids = stages.map((stage) => stage.id).join(',');
  if (!ids) return 'solo';
  if (ids === 'implementation') return 'delegate';
  if (ids === 'review') return 'audit';
  if (ids === 'implementation,review') return 'full';
  return 'invalid';
}

function uniqueTaskTypeId(baseId) {
  const ids = new Set($$('.task-type-id').map((input) => input.value.trim()).filter(Boolean));
  if (!ids.has(baseId)) return baseId;
  let suffix = 2;
  while (ids.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

function appendTaskType(taskType) {
  const card = taskTypeCard(taskType, $$('.task-type-card').length);
  $('#task-types').append(card);
  card.open = true;
  markDirty();
  refreshProviderOptions();
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPresetOptions() {
  const select = $('#task-type-preset');
  select.replaceChildren();
  for (const taskType of state.bundledDefaults?.task_types || []) {
    const option = document.createElement('option');
    option.value = taskType.id;
    option.dataset.presetName = taskType.name;
    option.dataset.presetRoute = taskType.route;
    option.textContent = `${taskType.name} · ${localizedRoute(taskType.route)}`;
    select.append(option);
  }
}

function refreshPresetOptionText() {
  for (const option of $$('#task-type-preset option')) {
    option.textContent = `${option.dataset.presetName} · ${localizedRoute(option.dataset.presetRoute)}`;
  }
}

function defaultProviderIdForRole(role, access) {
  const providers = $$('.provider-card').map((card) => ({
    id: $('.provider-id', card).value.trim(),
    role: card.dataset.role,
    read: $('.provider-read', card).checked,
    write: $('.provider-write', card).checked,
  })).filter((provider) => provider.id && provider.read && (access !== 'bounded_write' || provider.write));
  return providers.find((provider) => provider.role === role)?.id || providers[0]?.id || '';
}

function renderStages(card, route, previous = []) {
  const stages = ROUTE_STAGES[route].map((shape) => {
    const existing = previous.find((stage) => stage.id === shape.id);
    if (existing) return existing;
    const access = shape.role === 'reviewer' ? 'read_only' : 'bounded_write';
    return {
      ...shape,
      provider_id: defaultProviderIdForRole(shape.role, access),
      access,
      requires_user_approval: false,
      template: shape.role === 'reviewer'
        ? 'Review {{task}} using {{context}}. Respect {{constraints}} and verify against {{verification}}.'
        : 'Perform {{task}} using {{context}}. Respect {{constraints}} and verify with {{verification}}.',
    };
  });
  $('.task-stages', card).replaceChildren(...stages.map(stageEditor));
  refreshProviderOptions();
}

function taskTypeCard(taskType, index) {
  const details = document.createElement('details');
  details.className = 'card task-type-card';
  details.dataset.index = String(index);
  const summary = document.createElement('summary');
  const title = document.createElement('span');
  const meta = document.createElement('span');
  meta.className = 'card-meta';
  const initialRoute = routeForStages(taskType.stages);
  summary.append(title, meta);

  const body = document.createElement('div');
  body.className = 'card-body';
  const id = textInput(taskType.id, 'task-type-id');
  const name = textInput(taskType.name, 'task-type-name');
  const enabled = checkbox(taskType.enabled, 'task-type-enabled');
  const independentReview = checkbox(initialRoute === 'full', 'workflow-review');
  const standardWorkflow = initialRoute === 'delegate' || initialRoute === 'full';
  independentReview.disabled = !standardWorkflow;
  const workflowHint = document.createElement('p');
  workflowHint.className = 'hint workflow-hint';
  const description = textarea(taskType.description, 'task-type-description');
  const tags = textInput((taskType.tags || []).join(', '), 'task-type-tags');
  const stageContainer = document.createElement('div');
  stageContainer.className = 'task-stages stack';

  const refreshTaskTypeCopy = (route = initialRoute, stageCount = taskType.stages.length) => {
    const routeCopy = asCopy(ROUTE_LABELS[route] || route);
    setLocalizedOrUserText(title, name.value, '未命名任务类型', '(unnamed task type)');
    setLocalizedText(
      meta,
      `${routeCopy.zh} · ${stageCount} 个阶段`,
      `${routeCopy.en} · ${stageCount} stage(s)`,
    );
    if (standardWorkflow) {
      setLocalizedText(
        workflowHint,
        '工作流由阶段结构推导：implementation = delegate；implementation + review = full。',
        'Workflow is derived from Stages: implementation = delegate; implementation + review = full.',
      );
    } else {
      setLocalizedText(
        workflowHint,
        `专项 ${routeCopy.zh} 工作流由现有阶段结构推导。`,
        `Specialized ${routeCopy.en} workflow is derived from its existing Stage structure.`,
      );
    }
  };
  name.addEventListener('input', () => refreshTaskTypeCopy());
  independentReview.addEventListener('change', () => {
    const previous = currentStages(details);
    const nextRoute = independentReview.checked ? 'full' : 'delegate';
    renderStages(details, nextRoute, previous);
    refreshTaskTypeCopy(nextRoute, ROUTE_STAGES[nextRoute].length);
  });

  const toggles = document.createElement('div');
  toggles.className = 'grid three';
  toggles.append(
    field(copy('已启用', 'Enabled'), enabled),
  );
  body.append(
    grid(field(copy('任务类型 ID', 'Task Type id'), id), field(copy('显示名称', 'Display name'), name)),
    field(copy('独立审阅阶段（完整流程）', 'Independent review stage (full workflow)'), independentReview),
    workflowHint,
    toggles,
    field(copy('Codex 可见描述', 'Description visible to Codex'), description),
    field(copy('标签（逗号分隔）', 'Tags (comma separated)'), tags),
    stageContainer,
  );
  const actions = document.createElement('div');
  actions.className = 'actions';
  const duplicate = document.createElement('button');
  duplicate.type = 'button';
  duplicate.className = 'secondary small duplicate-task-type';
  setLocalizedText(duplicate, '复制任务类型', 'Duplicate Task Type');
  duplicate.addEventListener('click', () => {
    const copy = structuredClone(taskTypeFromCard(details));
    copy.id = uniqueTaskTypeId(`${copy.id || 'custom-task-type'}-copy`);
    copy.name = `${copy.name || 'Custom Task Type'} copy`;
    copy.enabled = false;
    appendTaskType(copy);
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger small';
  setLocalizedText(remove, '移除任务类型', 'Remove Task Type');
  remove.addEventListener('click', () => { details.remove(); markDirty(); });
  actions.append(duplicate, remove);
  body.append(actions);
  details.append(summary, body);
  renderStages(details, initialRoute, taskType.stages);
  refreshTaskTypeCopy();
  return details;
}

function refreshProviderOptions() {
  const active = document.activeElement;
  const activeStageProvider = active?.classList.contains('stage-provider') ? active : null;
  const providers = $$('.provider-card').map((card) => ({
    id: $('.provider-id', card).value.trim(),
    name: $('.provider-name', card).value.trim(),
    kind: $('.provider-kind', card).value,
    model: $('.provider-kind', card).value === 'native_agent'
      ? $('.provider-model', card)?.value.trim()
      : $('.provider-kind', card).value === 'openai_compatible'
        ? $('.provider-api-model', card)?.value.trim()
        : '',
    effort: $('.provider-reasoning-effort', card)?.value || '',
    read: $('.provider-read', card).checked,
    write: $('.provider-write', card).checked,
  })).filter((provider) => provider.id);
  for (const select of $$('.stage-provider')) {
    const current = select.value || select.dataset.current || '';
    const access = $('.stage-access', select.closest('.stage-card'))?.value || 'read_only';
    const compatible = providers.filter((provider) => provider.read && (access !== 'bounded_write' || provider.write));
    select.replaceChildren();
    for (const provider of compatible) {
      const option = document.createElement('option');
      option.value = provider.id;
      const identity = provider.model
        ? `${provider.kind === 'native_agent' ? modelDisplayName(provider.model) : provider.model}${provider.effort ? ` / ${provider.effort}` : ''}`
        : localizedValue(PROVIDER_KIND_LABELS[provider.kind] || copy(provider.kind));
      option.textContent = `${identity} — ${provider.name || localizedValue(copy('未命名连接', '(unnamed connection)'))}`;
      option.selected = provider.id === current;
      select.append(option);
    }
    if (!compatible.some((provider) => provider.id === current) && current) {
      const option = document.createElement('option');
      option.value = current;
      option.textContent = `${current}（${localizedValue(copy('缺失或不兼容', 'missing or incompatible'))}）`;
      option.selected = true;
      select.prepend(option);
    }
  }
  if (activeStageProvider?.isConnected) activeStageProvider.focus();
}

function render() {
  const config = state.config;
  const defaultTitle = copy('Codex Agents Workflow', 'Codex Agents Workflow');
  if (config.global.console_title) {
    clearLocalizedText($('#page-title'));
    $('#page-title').textContent = config.global.console_title;
  } else {
    setLocalizedText($('#page-title'), defaultTitle.zh, defaultTitle.en);
  }
  document.title = config.global.console_title || localizedValue(defaultTitle);
  $('#global-enabled').checked = config.global.enabled;
  $('#allow-direct-api').checked = config.global.allow_direct_api;
  $('#console-title').value = config.global.console_title;
  $('#providers').replaceChildren(...config.providers.map(providerCard));
  const catalogStatus = $('#model-catalog-status');
  if (state.modelCatalogError) {
    catalogStatus.className = 'hint error-text';
    setLocalizedText(catalogStatus, `模型列表读取失败：${state.modelCatalogError}`, `Could not load model list: ${state.modelCatalogError}`);
  } else {
    catalogStatus.className = 'hint';
    setLocalizedText(catalogStatus, `已从当前 Codex 登录读取 ${state.modelCatalog.length} 个可选模型。`, `${state.modelCatalog.length} selectable model(s) loaded from the current Codex login.`);
  }
  const secretStatus = $('#provider-secret-status');
  if (state.providerSecretsError) {
    secretStatus.className = 'hint error-text';
    setLocalizedText(secretStatus, `API Key 状态读取失败：${state.providerSecretsError}`, `Could not load API key status: ${state.providerSecretsError}`);
  } else {
    secretStatus.className = 'hint';
    setLocalizedText(secretStatus, 'API Key 仅保存在当前控制平面进程中，不会写入配置文件。', 'API keys stay only in the current control-plane process and are never written to configuration.');
  }
  $('#task-types').closest('section').hidden = config.version === 7;
  $('#load-defaults').hidden = config.version === 7;
  $('#defaults-heading').closest('section').hidden = config.version === 7;
  const lede = config.version === 7
    ? copy(
      '管理固定到工作流节点的 Provider。打开工作流工作区来编辑图、审阅资源并检查运行记录。',
      'Manage Providers pinned to Workflow nodes. Open the Workflow workspace to edit graphs, review resources, and inspect Runs.',
    )
    : copy(
      '定义可复用的任务类型，然后为每个实施或审阅阶段固定一个 Provider。Codex 可以选择任务类型，但不能更改 Provider 绑定或静默回退。',
      'Define reusable Task Types, then pin exactly one Provider to each implementation or review Stage. Codex may select a Task Type, but cannot change its Provider bindings or fall back silently.',
    );
  setLocalizedText($('.lede'), lede.zh, lede.en);
  $('#task-types').replaceChildren(...(config.task_types ?? []).map(taskTypeCard));
  renderPresetOptions();
  refreshProviderOptions();
  state.dirty = false;
  setBadge(copy('已加载', 'Loaded'), 'ok');
}

function collect() {
  const providers = $$('.provider-card').map((card) => {
    let config;
    try {
      config = JSON.parse($('.provider-config', card).value);
    } catch (error) {
      const providerId = $('.provider-id', card).value || t('未知', 'unknown');
      throw new Error(t(`Provider ${providerId} 的适配器 JSON 格式错误：${error.message}`, `Provider ${providerId} adapter JSON is invalid: ${error.message}`));
    }
    if ($('.provider-kind', card).value === 'native_agent') {
      config.model = $('.provider-model', card).value.trim();
      config.reasoning_effort = $('.provider-reasoning-effort', card).value;
    }
    return {
      id: $('.provider-id', card).value.trim(),
      name: $('.provider-name', card).value.trim(),
      kind: $('.provider-kind', card).value,
      enabled: $('.provider-enabled', card).checked,
      description: $('.provider-description', card).value,
      requires_user_approval: $('.provider-approval', card).checked,
      capabilities: {
        read: $('.provider-read', card).checked,
        write: $('.provider-write', card).checked,
        background: $('.provider-background', card).checked,
      },
      config,
    };
  });
  const taskTypes = $$('.task-type-card').map(taskTypeFromCard);
  return {
    ...structuredClone(state.config),
    global: {
      ...state.config.global,
      enabled: $('#global-enabled').checked,
      allow_direct_api: $('#allow-direct-api').checked,
      console_title: $('#console-title').value.trim(),
    },
    providers,
    ...(state.config.version === 7 ? {} : { task_types: taskTypes }),
  };
}

async function load(path = '/api/config') {
  setBadge(copy('加载中', 'Loading'));
  const [payload, defaultsPayload] = await Promise.all([
    api(path),
    state.bundledDefaults ? Promise.resolve(null) : api('/api/defaults'),
  ]);
  if (defaultsPayload) state.bundledDefaults = defaultsPayload.config;
  state.config = payload.config;
  state.savedConfig = structuredClone(payload.config);
  const [models, secrets] = await Promise.allSettled([
    api('/api/models'),
    api('/api/provider-secrets'),
  ]);
  if (models.status === 'fulfilled') {
    state.modelCatalog = models.value.models || [];
    state.modelCatalogError = '';
  } else {
    state.modelCatalog = [];
    state.modelCatalogError = models.reason?.message || String(models.reason);
  }
  if (secrets.status === 'fulfilled') {
    state.providerSecrets = Object.fromEntries((secrets.value.providers || []).map((item) => [item.provider_id, item]));
    state.providerSecretsError = '';
  } else {
    state.providerSecrets = {};
    state.providerSecretsError = secrets.reason?.message || String(secrets.reason);
  }
  if (path === '/api/config') {
    state.revision = payload.revision;
    state.storage = payload.storage;
    const global = state.storage?.scope === 'global';
    $('#config-storage').classList.toggle('override', !global);
    setLocalizedText(
      $('#config-storage-scope'),
      global
        ? '全局用户配置 — 所有项目和新任务共享'
        : '覆盖/测试配置 — 不会全局共享',
      global
        ? 'Global user configuration — shared by every project and new task'
        : 'Override/test configuration — not shared globally',
    );
    if (state.storage?.config_path) {
      clearLocalizedText($('#config-storage-path'));
      $('#config-storage-path').textContent = state.storage.config_path;
    } else {
      setLocalizedText($('#config-storage-path'), '未知路径', 'Unknown path');
    }
  }
  render();
}

async function save() {
  setBadge(copy('保存中', 'Saving'));
  const pendingSecrets = $$('.provider-card').map((card) => ({
    provider_id: $('.provider-id', card).value.trim(),
    api_key: $('.provider-api-key', card)?.value || '',
  })).filter((item) => item.api_key);
  const payload = await api('/api/config', {
    method: 'PUT',
    body: JSON.stringify({ config: collect(), expected_revision: state.revision }),
  });
  state.config = payload.config;
  state.savedConfig = structuredClone(payload.config);
  state.revision = payload.revision;
  for (const secret of pendingSecrets) {
    const result = await api('/api/provider-secret', { method: 'PUT', body: JSON.stringify(secret) });
    state.providerSecrets[result.provider_id] = result;
  }
  render();
  toast(copy('配置已保存。新的解析会立即使用它。', 'Configuration saved. New resolutions will use it immediately.'));
}

function attachSettingsEvents() {
$('#save').addEventListener('click', () => save().catch((error) => { setBadge(copy('错误', 'Error'), 'error'); toast(error.message, true); }));
$('#reload').addEventListener('click', async () => {
  if (state.dirty && !await confirmWorkbench(t('放弃未保存的更改并重新加载？', 'Discard unsaved changes and reload?'))) return;
  load().catch((error) => { setBadge(copy('错误', 'Error'), 'error'); toast(error.message, true); });
});
$('#load-defaults').addEventListener('click', async () => {
  if (!await confirmWorkbench(t('将内置默认配置载入编辑器？它们尚未保存。', 'Load bundled defaults into the editor? They are not saved yet.'))) return;
  api('/api/defaults').then((payload) => {
    state.bundledDefaults = payload.config;
    state.config = payload.config;
    render();
    markDirty();
    toast(copy('已载入内置默认配置。点击“保存配置”以应用。', 'Bundled defaults loaded. Press Save configuration to apply them.'));
  }).catch((error) => toast(error.message, true));
});
$('#add-provider').addEventListener('click', () => {
  const n = $$('.provider-card').length + 1;
  const firstModel = state.modelCatalog[0];
  const id = uniqueProviderId('native-provider');
  const provider = {
    id,
    name: t('新的原生连接', 'New native connection'),
    kind: 'native_agent',
    enabled: false,
    description: '',
    requires_user_approval: false,
    capabilities: { read: true, write: true, background: false },
    config: {
      agent_type: 'default',
      model: firstModel?.model || 'gpt-6-luna',
      reasoning_effort: firstModel?.defaultReasoningEffort || 'medium',
      role: 'advisor',
      fresh_context: true,
      requested_sandbox: 'workspace-write',
      inactivity_timeout_ms: 0,
    },
  };
  $('#providers').append(providerCard(provider, n - 1));
  markDirty();
  refreshProviderOptions();
});
$('#add-api-provider').addEventListener('click', () => {
  const n = $$('.provider-card').length + 1;
  const id = uniqueProviderId('api-provider');
  const envStem = id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const provider = {
    id,
    name: t('新的 API 连接', 'New API connection'),
    kind: 'openai_compatible',
    enabled: false,
    description: '',
    requires_user_approval: false,
    capabilities: { read: true, write: false, background: false },
    config: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: '',
      api_key_env: `CODEX_WORKFLOW_${envStem}_API_KEY`,
      auth_type: 'bearer',
      timeout_ms: 120000,
      max_output_tokens: 4096,
      max_tokens_field: 'max_tokens',
      temperature: 0.2,
      system_prompt: '',
      headers: {},
    },
  };
  $('#providers').append(providerCard(provider, n - 1));
  markDirty();
  refreshProviderOptions();
});
$('#refresh-models').addEventListener('click', () => {
  api('/api/models').then((payload) => {
    state.modelCatalog = payload.models || [];
    state.modelCatalogError = '';
    const wasDirty = state.dirty;
    state.config = collect();
    render();
    if (wasDirty) markDirty();
  }).catch((error) => {
    state.modelCatalogError = error.message;
    const status = $('#model-catalog-status');
    status.className = 'hint error-text';
    setLocalizedText(status, `模型列表读取失败：${error.message}`, `Could not load model list: ${error.message}`);
  });
});
$('#add-task-type-from-preset').addEventListener('click', () => {
  const source = state.bundledDefaults?.task_types.find((taskType) => taskType.id === $('#task-type-preset').value);
  if (!source) {
    toast(copy('没有可用的内置任务类型预设。', 'No bundled Task Type preset is available.'), true);
    return;
  }
  const taskType = structuredClone(source);
  const originalId = taskType.id;
  taskType.id = uniqueTaskTypeId(originalId);
  if (taskType.id !== originalId) {
    taskType.name = `${taskType.name} copy`;
    taskType.enabled = false;
  }
  appendTaskType(taskType);
});
$('#add-task-type').addEventListener('click', () => {
  const n = $$('.task-type-card').length + 1;
  const firstProvider = $('.provider-id')?.value || '';
  const taskType = {
    id: `custom-task-type-${n}`,
    name: `Custom Task Type ${n}`,
    enabled: false,
    description: '',
    tags: ['custom'],
    stages: [{
      id: 'implementation', role: 'implementer', provider_id: firstProvider,
      access: 'read_only', requires_user_approval: false,
      template: 'TASK\n{{task}}\n\nCONTEXT\n{{context}}\n\nCONSTRAINTS\n{{constraints}}\n\nVERIFICATION\n{{verification}}',
    }],
  };
  taskType.id = uniqueTaskTypeId(taskType.id);
  appendTaskType(taskType);
});
for (const selector of ['#global-enabled', '#allow-direct-api', '#console-title']) {
  $(selector).addEventListener('change', markDirty);
  $(selector).addEventListener('input', markDirty);
}
}

function applyLocale() {
  applyStaticTranslations();
  const localeSelector = $('#locale-selector');
  if (localeSelector) localeSelector.value = getLocale();
  refreshPresetOptionText();
  refreshProviderOptions();
  const pageTitle = $('#page-title');
  if (pageTitle?.dataset.i18nZh) document.title = t(pageTitle.dataset.i18nZh, pageTitle.dataset.i18nEn);
}

export function hasUnsavedSettings() { return state.dirty; }

/** @param {Document | HTMLElement} root */
export function mountSettings(root = document) {
  if (mountedRoots.has(root)) {
    settingsViewState.reloadOnReturn(root, () => load().catch((error) => {
      setBadge(copy('不可用', 'Unavailable'), 'error');
      toast(error.message, true);
    }));
    return;
  }
  settingsRoot = root;
  const workflowLink = $('#workflow-workspace');
  if (!workflowLink) throw new Error('The Provider settings view is missing its Workflow workspace link.');
  workflowLink.href = isMcpAppContext ? '#workflows' : '/workflows#token=' + encodeURIComponent(token);
  if (isMcpAppResource) workflowLink.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!await settingsViewState.canLeave(settingsRoot, state.dirty, () => confirmWorkbench(t('放弃未保存的更改并返回工作流工作区？', 'Discard unsaved Provider changes and return to the Workflow workspace?')), () => { state.config = structuredClone(state.savedConfig ?? state.config); render(); })) return;
    setAppView('workflows');
  });
  attachSettingsEvents();
  const localeSelector = $('#locale-selector');
  localeSelector.value = getLocale();
  localeSelector.addEventListener('change', () => setLocale(localeSelector.value));
  subscribeLocale(applyLocale);
  applyLocale();
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  mountedRoots.add(root);
  load().catch((error) => {
    setBadge(copy('不可用', 'Unavailable'), 'error');
    toast(error.message, true);
  });
}

const initialView = document.querySelector('meta[name="codex-agents-workflow-view"]')?.content;
if (!isMcpAppResource || initialView === 'settings') mountSettings(document.getElementById('settings-shell') ?? document);
