// Presentation preference only. Never place credentials or configuration drafts here.
export const LOCALE_STORAGE_KEY = 'codex-agents-workflow.locale';
const supported = value => value === 'zh-CN' || value === 'en';

export function createLocaleStore(host) {
  const preferred = host?.navigator?.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  const stored = host?.localStorage.getItem(LOCALE_STORAGE_KEY);
  let locale = supported(stored) ? stored : host ? preferred : 'zh-CN';
  const listeners = new Set();
  function publish(next) {
    if (host?.document) host.document.documentElement.lang = next;
    if (next === locale) return;
    locale = next;
    for (const listener of listeners) listener();
  }
  if (host?.document) host.document.documentElement.lang = locale;
  host?.addEventListener('storage', event => {
    if (event.storageArea !== host.localStorage || (event.key !== LOCALE_STORAGE_KEY && event.key !== null)) return;
    publish(supported(event.newValue) ? event.newValue : preferred);
  });
  return {
    getLocale: () => locale,
    setLocale(next) {
      if (!supported(next)) throw new Error('Unsupported workbench locale: ' + next);
      // Persist before notifying so a storage failure is visible, never a false success.
      host?.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      publish(next);
    },
    subscribeLocale(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    t: (zh, en) => locale === 'zh-CN' ? zh : en,
  };
}

const store = createLocaleStore(typeof window === 'undefined' ? undefined : window);
export const { getLocale, setLocale, subscribeLocale, t } = store;
