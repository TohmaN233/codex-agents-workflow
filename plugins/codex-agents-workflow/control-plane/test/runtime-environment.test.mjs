import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {discoverRuntimeEnvironment} from '../lib/runtime-environment.mjs';

test('dependency discovery searches host installations and supplied directories without installing',async()=>{
 const root=await mkdtemp(join(tmpdir(),'workflow-environment-'));
 try {
  const home=join(root,'home'),bin=join(home,'Miniconda3'),custom=join(root,'tools');
  await mkdir(bin,{recursive:true});await mkdir(custom);
  const suffix=process.platform==='win32'?'.exe':'';
  await writeFile(join(bin,'python'+suffix),'fixture');await writeFile(join(custom,'media-tool'+suffix),'fixture');
  const env={USERPROFILE:home,HOME:home,PATH:''};
  const missing=await discoverRuntimeEnvironment({executables:['python','media-tool']},{env});
  assert.equal(missing.status,'installation_approval_required');assert.deepEqual(missing.missing,['media-tool']);
  assert.equal(missing.installation_performed,false);assert.equal(missing.tools[0].status,'found');
  const ready=await discoverRuntimeEnvironment({executables:['python','media-tool','python']},{env,extraDirectories:[custom]});
  assert.equal(ready.status,'ready');assert.equal(ready.tools.length,2);assert.equal(ready.tools[1].path,await realpath(join(custom,'media-tool'+suffix)));
 } finally {await rm(root,{recursive:true,force:true});}
});

test('dependency discovery rejects command strings and relative search directories',async()=>{
 await assert.rejects(discoverRuntimeEnvironment({executables:['python --version']}),{code:'ENVIRONMENT_DEPENDENCY_NAME'});
 await assert.rejects(discoverRuntimeEnvironment({executables:[]},{extraDirectories:['relative']}),{code:'ENVIRONMENT_DIRECTORIES'});
});
