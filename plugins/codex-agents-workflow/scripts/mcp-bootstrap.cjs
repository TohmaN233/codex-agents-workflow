const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');

function registeredRoot(registry, home) {
  const entries = registry.installed.filter(p => p.pluginId === 'codex-agents-workflow@codex-agents-workflow' && p.installed);
  if(entries.length !== 1 || !entries[0].enabled || !/^[0-9][A-Za-z0-9.+_-]*$/.test(entries[0].version)) throw Error('WORKFLOW_PLUGIN_REGISTRY: expected one enabled installed version');
  return {version:entries[0].version,root:path.join(home,'plugins/cache/codex-agents-workflow/codex-agents-workflow',entries[0].version)};
}

async function boot() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(),'.codex');
  const auditRoot=path.join(home,'codex-agents-workflow');
  await fs.mkdir(auditRoot,{recursive:true});
  const audit=event=>fs.appendFile(path.join(auditRoot,'mcp-startup.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,...event})+'\n');
  try {
    // Ask the installation registry on EVERY handshake. Never choose max(cache dirs)
    // or use the revision captured by a long-running host's plugin catalog.
    const {stdout}=await promisify(execFile)(process.env.CODEX_CLI_PATH || 'codex',['plugin','list','--marketplace','codex-agents-workflow','--json'],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});
    const selected=registeredRoot(JSON.parse(stdout),home);
    const manifest=JSON.parse(await fs.readFile(path.join(selected.root,'.codex-plugin/plugin.json'),'utf8'));
    if(manifest.name!=='codex-agents-workflow'||manifest.version!==selected.version)throw Error('WORKFLOW_PLUGIN_IDENTITY: registered version does not match installed files');
    // Node resolves imported modules through filesystem aliases. Use that same
    // physical entry for argv so server.mjs recognizes itself as the main module.
    const entry=await fs.realpath(path.join(selected.root,'control-plane/server.mjs'));
    await audit({phase:'resolved',version:selected.version,entry});
    process.chdir(selected.root);process.argv[1]=entry;
    await import(pathToFileURL(entry).href);
  } catch(error) {
    await audit({phase:'failed',code:error.code??'WORKFLOW_MCP_BOOT_FAILED',message:error.message});
    throw error;
  }
}
module.exports={registeredRoot,boot};
