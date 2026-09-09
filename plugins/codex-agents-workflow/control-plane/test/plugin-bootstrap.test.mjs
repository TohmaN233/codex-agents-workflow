import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from './physical-tempdir.mjs';
import {installRetainingRevisions} from '../../scripts/install-local.mjs';
const {registeredRoot}=createRequire(import.meta.url)('../../scripts/mcp-bootstrap.cjs');
test('bootstrap selects only the registry version, rejects disabled or ambiguous installation',()=>{
 const entry={pluginId:'codex-agents-workflow@codex-agents-workflow',installed:true,enabled:true,version:'0.8.0+current'};
 assert.equal(registeredRoot({installed:[entry]},resolve(tmpdir())).version,entry.version);
 assert.throws(()=>registeredRoot({installed:[entry,entry]},resolve(tmpdir())),/REGISTRY/);
 assert.throws(()=>registeredRoot({installed:[{...entry,enabled:false}]},resolve(tmpdir())),/REGISTRY/);
 assert.throws(()=>registeredRoot({installed:[{...entry,version:'../elsewhere'}]},resolve(tmpdir())),/REGISTRY/);
});
test('upgrade preserves old cached paths and records host leases even when the installer removes files',async()=>{
 const home=await mkdtemp(join(tmpdir(),'retained-plugin-'));
 try{
  const old=join(home,'plugins/cache/codex-agents-workflow/codex-agents-workflow/1.0.0');
  await mkdir(join(old,'.codex-plugin'),{recursive:true});
  await writeFile(join(old,'.codex-plugin/plugin.json'),JSON.stringify({name:'codex-agents-workflow',version:'1.0.0'}));
  await writeFile(join(old,'server.js'),'original bytes');
  const result=await installRetainingRevisions({home,hosts:[{pid:1,started_at:'identity'}],install:async()=>{assert(old.startsWith(home));await rm(old,{recursive:true});}});
  assert.equal(await readFile(join(old,'server.js'),'utf8'),'original bytes');
  assert.deepEqual(result.retained_versions,['1.0.0']);
  assert.deepEqual(JSON.parse(await readFile(join(home,'codex-agents-workflow/runtime-retention.json'),'utf8')).versions['1.0.0'],[{pid:1,started_at:'identity'}]);
 }finally{assert(home.startsWith(resolve(tmpdir())));await rm(home,{recursive:true});}
});
