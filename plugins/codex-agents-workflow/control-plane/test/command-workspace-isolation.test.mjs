import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {tmpdir} from './physical-tempdir.mjs';
import {homedir} from 'node:os';
import {createCodexCommandBroker} from '../lib/execution/codex-command-broker.mjs';
import {createCodexClient} from '../lib/execution/codex-app-server-client.mjs';

const execute=promisify(execFile);
async function fixture(t,{base=tmpdir(),cleanup=true}={}){
  const root=await mkdtemp(join(base,'main-command-isolation-')),workspace=join(root,'project'),own=join(workspace,'a'),sibling=join(workspace,'b'),home=join(root,'home');
  await Promise.all([mkdir(own,{recursive:true}),mkdir(sibling,{recursive:true}),mkdir(home)]);
  const marker=join(workspace,'read-fixture.txt');await writeFile(marker,'readonly source');
  if(cleanup)t.after(()=>rm(root,{recursive:true,force:true}));return {root,workspace,own,sibling,home,marker};
}
function broker(f,client,events=[]){return createCodexCommandBroker({binary:process.execPath,home:f.home,cwd:f.own,access:'bounded_write',allowedPaths:['.'],
  spoolRoot:join(f.own,'.workflow-spool'),getClient:()=>client,getOutputBudget:()=>({max_result_bytes:4096}),
  isolatedWorkspace:{read_path:f.marker,outside_directories:[f.workspace,f.sibling]},onOperation:async event=>events.push(event)});}

test('actual command boundary rejects an uncontained client before any task command and cleans leaked probe files',async t=>{
  const f=await fixture(t),calls=[];
  const client={async call(method,params){calls.push(params);assert.equal(method,'command/exec');const result=await execute(params.command[0],params.command.slice(1),{cwd:params.cwd,windowsHide:true});return {...result,exitCode:0};},async close(){}};
  const commands=broker(f,client);t.after(()=>commands.close());
  await assert.rejects(commands.call('run_workspace_command',{cmd:'Write-Output MUST-NOT-RUN'},'task-command'),{code:'CODEX_COMMAND_ISOLATION'});
  assert.equal(calls.length,1);assert.deepEqual(calls[0].sandboxPolicy.writableRoots,[f.own,calls[0].env.TMP]);
  assert((await readdir(f.own)).every(name=>name==='.workflow-spool'));assert.equal((await readdir(f.sibling)).length,0);
  assert.deepEqual(await readdir(f.workspace),['a','b','read-fixture.txt']);
});

test('actual qualified Windows App Server reads the original project and cannot write sibling or project directories',{
  skip:process.platform!=='win32'||!process.env.WORKFLOW_ISOLATION_CODEX_BINARY,
},async t=>{
  const f=await fixture(t,{base:process.cwd(),cleanup:false}),events=[];
  const client=createCodexClient(process.env.WORKFLOW_ISOLATION_CODEX_BINARY,{home:process.env.CODEX_HOME||join(homedir(),'.codex'),cwd:f.own,commandOnly:true});
  const commands=broker(f,client,events);t.after(async()=>{const closed=await Promise.allSettled([commands.close(),client.close()]);await rm(f.root,{recursive:true,force:true});const errors=closed.filter(item=>item.status==='rejected').map(item=>item.reason);if(errors.length)throw new AggregateError(errors,'Qualification cleanup failed');});
  await client.call('initialize',{clientInfo:{name:'workflow_isolation_qualification',version:'1.0.0'},capabilities:{experimentalApi:true}});client.initialized();await commands.qualifyIsolation();
  assert(events.some(event=>event.phase==='isolation_qualified'));
  const response=await commands.call('run_workspace_command',{cmd:"[IO.File]::WriteAllText('result.txt','own result'); Get-Content -LiteralPath '../read-fixture.txt'",login:false},'qualified-command');
  const result=JSON.parse(response.contentItems[0].text);assert.equal(result.exit_code,0);assert.match(result.output,/readonly source/);assert.equal(await readFile(join(f.own,'result.txt'),'utf8'),'own result');
  t.diagnostic('Actual command/exec sandbox qualified; no model turns or Workflow Runs.');
});
