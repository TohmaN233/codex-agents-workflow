import { appendFile, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, configRevision } from '../control-plane/lib/config.mjs';

// Explicit maintenance migration; normal reads and installation never rewrite settings.
export async function useConfigurableNativeProviders(configPath) {
  const defaultConfigPath = fileURLToPath(new URL('../control-plane/default-config.json', import.meta.url));
  const config = await loadConfig({ configPath, defaultConfigPath });
  const revision = configRevision(config);
  const shipped = new Set(['codex_workflow_luna_implementer','codex_workflow_terra_implementer','codex_workflow_reviewer']);
  const changes = [];
  for (const provider of config.providers) {
    if (provider.kind !== 'native_agent' || !shipped.has(provider.config.agent_type)) continue;
    changes.push({provider_id:provider.id,from:provider.config.agent_type,to:'default',model:provider.config.model,reasoning_effort:provider.config.reasoning_effort});
    provider.config.agent_type = 'default';
  }
  if (!changes.length) return {changed:false,changes};
  const backup = configPath + '.native-binding-' + Date.now() + '.bak';
  await copyFile(configPath, backup, constants.COPYFILE_EXCL);
  await saveConfig(config,{configPath,expectedRevision:revision});
  await appendFile(join(dirname(configPath),'provider-migrations.jsonl'), JSON.stringify({at:new Date().toISOString(),operation:'use-configurable-native-providers',backup,changes})+'\n');
  return {changed:true,backup,changes};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error('Usage: node use-configurable-native-providers.mjs <absolute config path>');
  console.log(JSON.stringify(await useConfigurableNativeProviders(resolve(process.argv[2]))));
}
