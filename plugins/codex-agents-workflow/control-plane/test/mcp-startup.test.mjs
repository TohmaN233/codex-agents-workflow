import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join,toNamespacedPath} from 'node:path';
import {probe} from '../../scripts/check-mcp-startup.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');

async function fixture(t) {
 const rootDir=await mkdtemp(join(tmpdir(),'workflow-mcp-startup-'));
 t.after(()=>rm(rootDir,{recursive:true,force:true}));
 const home=join(rootDir,'home');
 const version=JSON.parse(await readFile(join(root,'.codex-plugin','plugin.json'),'utf8')).version;
 const cached=join(home,'plugins','cache','codex-agents-workflow','codex-agents-workflow',version);
 const excluded=new Set(['node_modules','test','web-src','workflow-runs']);
 await mkdir(join(cached,'.codex-plugin'),{recursive:true});
 await cp(join(root,'.codex-plugin','plugin.json'),join(cached,'.codex-plugin','plugin.json'));
 await cp(join(root,'agents'),join(cached,'agents'),{recursive:true});
 await cp(join(root,'control-plane'),join(cached,'control-plane'),{recursive:true,filter:source=>!source.split(/[\\/]/).some(part=>excluded.has(part))});
 const cwd=join(rootDir,'cwd');
 await mkdir(cwd,{recursive:true});
 // Preload the fake CLI before Node resolves its relative "plugin" entry point:
 // that entry-point resolution itself is unsupported under a Windows namespaced cwd.
 const registryCli=join(rootDir,'registry-cli.cjs');
 await writeFile(registryCli,`if(process.argv[2]==='list' && process.argv[3]==='--marketplace' && process.argv[4]==='codex-agents-workflow' && process.argv[5]==='--json'){process.stdout.write(JSON.stringify({installed:[{pluginId:'codex-agents-workflow@codex-agents-workflow',installed:true,enabled:true,version:${JSON.stringify(version)}}]}));process.exit(0);}\n`);
 return {home,cwd,env:{...process.env,CODEX_HOME:home,HOME:home,USERPROFILE:home,CODEX_CLI_PATH:process.execPath,NODE_OPTIONS:`--require ${JSON.stringify(registryCli)}`}};
}

test('packaged MCP initializes and exposes execution tools from ordinary and Windows extended paths',async t=>{
 const fx=await fixture(t);
 for(const cwd of [...new Set([fx.cwd,toNamespacedPath(fx.cwd)])])assert.equal((await probe(root,{cwd,env:fx.env})).status,'ready');
});
