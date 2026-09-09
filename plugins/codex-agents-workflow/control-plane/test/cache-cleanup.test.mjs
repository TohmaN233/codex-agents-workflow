import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from './physical-tempdir.mjs';
import {WorkflowStore} from '../lib/workflow-store.mjs';
import {createDraft} from '../lib/workflow-schema.mjs';
import {cleanupCaches,pluginCachePlan} from '../lib/cache-cleanup.mjs';
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'workflow-cache-'));
  t.after(async()=>{assert(resolve(root).startsWith(resolve(tmpdir())));await rm(root,{recursive:true,force:true});});
  const store=await new WorkflowStore(join(root,'workflows')).initialize();
  const writer=await new WorkflowStore(join(root,'runs')).initialize();
  const pins=[];
  const runs={writer,list:async()=>pins.map((_,i)=>({run_id:String(i)})),read:async id=>({pins:pins[Number(id)]})};
  const home=join(root,'home');await mkdir(home);await writeFile(join(home,'config.toml'),'');
  const pluginRoot=join(home,'plugins/cache/codex-agents-workflow/codex-agents-workflow');
  for(const version of ['0.8.0+old','0.8.0+active','0.8.0+current']) {
    await mkdir(join(pluginRoot,version,'.codex-plugin'),{recursive:true});
    await writeFile(join(pluginRoot,version,'.codex-plugin/plugin.json'),JSON.stringify({name:'codex-agents-workflow',version}));
    await writeFile(join(pluginRoot,version,'source.txt'),'plugin source');
  }
  return {store,runs,pins,home,auditRoot:root,pluginRoot,inventory:async()=>({installed:['0.8.0+current'],active:['0.8.0+active']})};
}
test('cleanup removes only unreferenced history/blobs and inactive plugin versions, with durable evidence',async t=>{
  const f=await fixture(t);
  const old=await f.store.create(createDraft('sample','old'),{resources:{'a.txt':'unused'}});
  const pinned=await f.store.save('sample',{...old.workflow,name:'pinned'},{expected_revision:old.revision_hash,resources:{'a.txt':'run resource'}});
  const current=await f.store.save('sample',{...old.workflow,name:'current'},{expected_revision:pinned.revision_hash,resources:{'a.txt':'current resource'}});
  f.pins.push({root:pinned});
  const preview=await cleanupCaches({...f,preview:true});
  assert.equal(preview.workflow_revisions,1);assert.equal(preview.workflow_resources,1);assert.equal(preview.plugin_versions,1);
  await f.store.snapshot('sample',old.revision_hash);
  const result=await cleanupCaches(f);
  assert.equal(result.bytes,preview.bytes);
  await assert.rejects(f.store.snapshot('sample',old.revision_hash),{code:'ENOENT'});
  assert.equal((await f.store.snapshot('sample')).revision_hash,current.revision_hash);
  assert.equal((await f.store.resources('sample',pinned.revision_hash))['a.txt'].toString(),'run resource');
  await assert.rejects(lstat(join(f.pluginRoot,'0.8.0+old')),{code:'ENOENT'});
  await lstat(join(f.pluginRoot,'0.8.0+active'));await lstat(join(f.pluginRoot,'0.8.0+current'));
  const audit=JSON.parse(await readFile(result.audit_file,'utf8'));assert.equal(audit.status,'complete');assert.equal(audit.deleted.length,3);
  assert.equal((await cleanupCaches({...f,preview:true})).bytes,0);
});
test('retained provenance pins preserve referenced historical revisions transitively',async t=>{
  const f=await fixture(t);
  const child=await f.store.create(createDraft('child','child'),{resources:{'a':'child'}});
  const middle=await f.store.create(createDraft('middle','middle'),{provenance:{source_revision:child.revision_hash}});
  await f.store.save('child',{...child.workflow,name:'new child'},{expected_revision:child.revision_hash});
  await f.store.save('middle',{...middle.workflow,name:'new middle'},{expected_revision:middle.revision_hash,provenance:{}});
  await f.store.create(createDraft('parent','parent'),{provenance:{source_revision:middle.revision_hash}});
  assert.equal((await cleanupCaches({...f,preview:true})).workflow_revisions,0);
});
test('plugin identity and changing active-process protections fail visibly before deleting the protected version',async t=>{
  const f=await fixture(t);let count=0;
  await assert.rejects(cleanupCaches({...f,inventory:async()=>({installed:['0.8.0+current'],active:++count===1?['0.8.0+active']:['0.8.0+active','0.8.0+old']})}),{code:'CACHE_CHANGED'});
  await lstat(join(f.pluginRoot,'0.8.0+old'));
  await writeFile(join(f.pluginRoot,'0.8.0+old/.codex-plugin/plugin.json'),JSON.stringify({name:'another-plugin',version:'0.8.0+old'}));
  await assert.rejects(pluginCachePlan(f.home,{inventory:f.inventory}),{code:'CACHE_PLUGIN_ID'});
});
