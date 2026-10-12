import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from './physical-tempdir.mjs';
import {createCodexCommandBroker} from '../lib/execution/codex-command-broker.mjs';
import {execFile} from 'node:child_process';
import {prepareOwnedCommandTemp} from '../lib/execution/owned-command-temp.mjs';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const inside=(root,path)=>{const r=relative(root,path);return !r||!isAbsolute(r)&&r!=='..'&&!r.startsWith('..');};
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'owned-temp-test-')),workspace=join(root,'workspace');await mkdir(workspace);
 const calls=[],events=[];
 const client={async call(_method,args){calls.push(args);if(args.command[1]==='-e'){const r=await execute(args.command[0],args.command.slice(1),{cwd:args.cwd,env:{...process.env,...args.env},windowsHide:true});return {...r,exitCode:0};}
 const spec=JSON.parse(await readFile(args.command.at(-1),'utf8'));await writeFile(spec.output_path,'neutral');return {exitCode:0,stdout:JSON.stringify({schema_version:1,exit_code:0,output_bytes:7}),stderr:''};},async close(){}};
 const make=()=>createCodexCommandBroker({binary:process.execPath,home:root,cwd:workspace,access:'bounded_write',allowedPaths:['.'],spoolRoot:join(workspace,'.workflow-command-output','receipt'),getClient:()=>client,getOutputBudget:()=>({max_result_bytes:4096}),isolatedWorkspace:{read_path:'unused',outside_directories:[]},getExecutionPolicy:()=>({command_type:'dangerFullAccess',thread_type:'dangerFullAccess'}),onOperation:async event=>events.push(event)});
 t.after(()=>rm(root,{recursive:true,force:true}));return {root,workspace,calls,events,make,client};
}
test('isolated broker uses uniquely owned platform temp leaf and keeps original workspace spool',async t=>{
 const f=await fixture(t),a=f.make(),b=f.make();t.after(async()=>{await a.close();await b.close();});
 await a.call('run_workspace_command',{cmd:'neutral'},'a');await b.call('run_workspace_command',{cmd:'neutral'},'b');
 const calls=f.calls.filter(item=>item.command[1]!=='-e');const paths=calls.map(item=>item.env.TMP);
 assert(paths.every(path=>!inside(f.workspace,path)));assert.notEqual(paths[0],paths[1]);
 assert(paths.every(path=>inside(tmpdir(),path)));assert(calls.every(item=>item.env.TEMP===item.env.TMP));
 assert(calls.every(item=>inside(join(f.workspace,'.workflow-command-output'),item.command.at(-1))));
 await writeFile(join(paths[0],'scratch'),'technical temporary content');await a.close();
 await assert.rejects(lstat(paths[0]),{code:'ENOENT'});assert((await lstat(paths[1])).isDirectory());await b.close();
});

test('owned temp rejects owner tampering and preserves leaf instead of deleting uncertain ownership',async t=>{
 const f=await fixture(t),temp=await prepareOwnedCommandTemp({workspace:f.workspace,spool:join(f.workspace,'spool')});
 await writeFile(join(temp.path,'.host-command-temp-owner.json'),'changed owner');
 await assert.rejects(temp.assertOwned(),{code:'CODEX_COMMAND_TEMP_OWNER'});await assert.rejects(temp.close(),{code:'CODEX_COMMAND_TEMP_OWNER'});
 assert((await lstat(temp.path)).isDirectory());await rm(temp.path,{recursive:true});
});
test('owned temp cleanup failure is visible and can only reconcile the same exact leaf',async t=>{
 const f=await fixture(t),temp=await prepareOwnedCommandTemp({workspace:f.workspace,spool:join(f.workspace,'spool')});
 const original=fsPromises.rm;
 fsPromises.rm=async(path,...args)=>{if(path===temp.path)throw Object.assign(new Error('denied owned temp cleanup'),{code:'EACCES'});return original(path,...args);};syncBuiltinESMExports();
 try{await assert.rejects(temp.close(),{code:'EACCES'});}finally{fsPromises.rm=original;syncBuiltinESMExports();}
 assert((await lstat(temp.path)).isDirectory());await temp.close();await assert.rejects(lstat(temp.path),{code:'ENOENT'});
});

test('isolated capability RPC failure is explicit before any business command',async t=>{
 const f=await fixture(t);let requests=0;
 const commands=createCodexCommandBroker({binary:process.execPath,home:f.root,cwd:f.workspace,access:'bounded_write',allowedPaths:['.'],spoolRoot:join(f.workspace,'spool'),getClient:()=>({async call(){requests++;throw new Error('exact RPC unavailable');}}),getOutputBudget:()=>({max_result_bytes:4096}),isolatedWorkspace:{read_path:join(f.root,'read.txt'),outside_directories:[f.root]}});
 await writeFile(join(f.root,'read.txt'),'read');
 await assert.rejects(commands.qualifyIsolation(),error=>error.code==='CODEX_COMMAND_ISOLATION_UNCONFIRMED'&&error.cause.message==='exact RPC unavailable');assert.equal(requests,1);assert.equal(commands.audit().length,0);await commands.close();
});

test('default shell temp capability is qualified before model admission and selected custom shell stays exact',async t=>{
 const f=await fixture(t),commands=f.make();t.after(()=>commands.close());
 await commands.qualifyIsolation();assert.equal(f.calls.length,1);assert.equal(f.calls[0].command[1],'-e');assert.equal(commands.audit().length,0);
 await commands.call('run_workspace_command',{cmd:'neutral',login:false},'default');assert.equal(f.calls.filter(item=>item.command[1]==='-e').length,1,'same effective default login does not duplicate preflight');
 if(process.platform==='win32'){await commands.call('run_workspace_command',{cmd:'neutral',shell:'cmd.exe',login:false},'custom');assert.equal(f.calls.filter(item=>item.command[1]==='-e').length,2);}
});

const latch=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
test('close waits for owned temp allocation and forbids late capability launch',async t=>{
 const f=await fixture(t),commands=f.make(),entered=latch(),release=latch();let allocated,closed=false;
 const original=fsPromises.mkdtemp;
 fsPromises.mkdtemp=async(...args)=>{const path=await original(...args);if(String(args[0]).endsWith('wf-cmd-')){allocated=path;entered.resolve();await release.promise;}return path;};syncBuiltinESMExports();
 let preparing,closing;
 try{
   preparing=commands.qualifyIsolation();void preparing.catch(()=>{});await entered.promise;
   closing=commands.close().then(()=>{closed=true;});void closing.catch(()=>{});await new Promise(setImmediate);
   const closedEarly=closed;release.resolve();const results=await Promise.allSettled([preparing,closing]);
   assert.equal(closedEarly,false);assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.code,'CODEX_COMMAND_REVOKED');assert.equal(results[1].status,'fulfilled');assert.equal(f.calls.length,0);await assert.rejects(lstat(allocated),{code:'ENOENT'});
 }finally{release.resolve();fsPromises.mkdtemp=original;syncBuiltinESMExports();await Promise.allSettled([preparing,closing].filter(Boolean));if(allocated)await rm(allocated,{recursive:true,force:true});}
});
test('close drains exact pending shell qualification before cleaning owned temp',async t=>{
 const f=await fixture(t),commands=f.make(),entered=latch(),release=latch();let closed=false;
 const original=f.client.call;f.client.call=async(...args)=>{if(args[1].command[1]==='-e'){entered.resolve();await release.promise;}return original(...args);};
 const preparing=commands.qualifyIsolation();void preparing.catch(()=>{});await entered.promise;
 const temp=f.events.find(event=>event.phase==='temp_prepared').runtime_temp.path;
 const closing=commands.close().then(()=>{closed=true;});void closing.catch(()=>{});await new Promise(setImmediate);
 const closedEarly=closed;release.resolve();const results=await Promise.allSettled([preparing,closing]);
 assert.equal(closedEarly,false);assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.code,'CODEX_COMMAND_REVOKED');assert.equal(results[1].status,'fulfilled');assert.equal(f.calls.length,1);await assert.rejects(lstat(temp),{code:'ENOENT'});
});

test('close drains isolation preparation and blocks its late RPC launch',async t=>{
 const f=await fixture(t),entered=latch(),release=latch();let closed=false;const events=[];
 const readPath=join(f.root,'read.txt');await writeFile(readPath,'neutral');
 const commands=createCodexCommandBroker({binary:process.execPath,home:f.root,cwd:f.workspace,access:'bounded_write',allowedPaths:['.'],spoolRoot:join(f.workspace,'spool'),getClient:()=>f.client,getOutputBudget:()=>({max_result_bytes:4096}),isolatedWorkspace:{read_path:readPath,outside_directories:[f.root]},onOperation:async event=>{events.push(event);if(event.phase==='isolation_begin'){entered.resolve();await release.promise;}}});
 const preparing=commands.qualifyIsolation();void preparing.catch(()=>{});await entered.promise;
 const temp=events.find(event=>event.phase==='temp_prepared').runtime_temp.path;
 const closing=commands.close().then(()=>{closed=true;});void closing.catch(()=>{});await new Promise(setImmediate);
 const closedEarly=closed;release.resolve();const results=await Promise.allSettled([preparing,closing]);
 assert.equal(closedEarly,false);assert.equal(results[0].reason.code,'CODEX_COMMAND_REVOKED');assert.equal(results[1].status,'fulfilled');assert.equal(f.calls.length,0);await assert.rejects(lstat(temp),{code:'ENOENT'});
 assert(events.find(event=>event.phase==='close_begin').pending_preparations.some(phase=>phase.kind==='isolation_capability'));
});
