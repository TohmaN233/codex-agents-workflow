import test from 'node:test';
import assert from 'node:assert/strict';
import {delimiter} from 'node:path';
import {newestVersion} from '../lib/execution/local-codex-catalog.mjs';
import {pathClientCandidates,CLIENT_MANAGED_MODELS} from '../connectors/local-client-paths.mjs';
import {createCodexClient} from '../lib/execution/codex-app-server-client.mjs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
test('client discovery compares versions numerically and preserves explicit model uncertainty',()=>{
 assert.equal(newestVersion([{binary:'old',version:'0.99.0'},{binary:'new',version:'0.153.4'}]).binary,'new');
 assert.equal(CLIENT_MANAGED_MODELS.available,null);
 const root=process.platform==='win32'?'C:\\tools':'/tools';
 assert.equal(pathClientCandidates('grok',{PATH:root+delimiter+'relative'+delimiter+root}).length,1);
});
test('catalog-only App Server cannot start a model, login, or edit skills',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.pid=123;child.kill=()=>child.emit('close',0);
 const client=createCodexClient('test',{home:'.',cwd:'.',catalogOnly:true,spawnImpl:()=>child});
 for(const method of ['thread/start','turn/start','account/login/start','skills/config/write'])assert.throws(()=>client.call(method,{}),/outside qualified/);
 child.emit('close',0);await client.close();
});
