import { createCodexSession } from './codex-session.mjs';

// Access remains a Workflow task constraint, not an override of the user's
// Codex permission settings.
export function managedThreadStartParams({ cwd, model, dynamicTools = [] }) {
  return { cwd, model, allowProviderModelFallback: false, ephemeral: false,
    dynamicTools: structuredClone(dynamicTools) };
}

export async function createManagedNativeSession(options) {
  return createCodexSession(options);
}
