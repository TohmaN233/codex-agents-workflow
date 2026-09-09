import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from './physical-tempdir.mjs';
import { WorkflowService } from '../lib/workflow-service.mjs';
import { loadConfig } from '../lib/config.mjs';
import { DEFAULT_CONFIG_PATH } from '../server.mjs';
import { createWorkflowPreset } from '../lib/workflow-presets.mjs';
import { defaultRoutingRules } from '../lib/skill-import/routing-rules.mjs';

async function fixture(t,preset_id='collaborative-image') {
  const root=await mkdtemp(join(tmpdir(),'workflow-presets-'));t.after(()=>rm(root,{recursive:true,maxRetries:3,retryDelay:100}));
  const workspace=join(root,'workspace');await mkdir(workspace);
  const configPath=join(root,'control-plane.json');await loadConfig({configPath,defaultConfigPath:DEFAULT_CONFIG_PATH});
  const service=new WorkflowService({configPath,defaultConfigPath:DEFAULT_CONFIG_PATH,env:{}});
  await service.call('migrate_v6',{}, {human:true});
  const pack=await service.call('install_preset',{preset_id},{human:true});
  const {runtime,executor}=await service.open();
  const run=await runtime.start({workflow_id:pack.workflow.id,workspace,access:'bounded_write',allowed_paths:['edit'],main_actor:'root',inputs:{task:'Synthetic delivery'}});
  const claim=node_id=>runtime.claimNode(run.run_id,{node_id,owner:'root',request_id:'claim-'+node_id,control_token:run.control_token});
  const complete=(lease,output,accept=false)=>runtime.completeNode(run.run_id,{...lease,completion:{status:'succeeded',summary:'Synthetic scheduling evidence',structured_output:output,artifacts:[],evidence:[{check:'scheduler fixture'}],changed_paths:[],outside_paths:[],...(accept?{acceptance:{accepted:true}}:{})}});
  return {service,runtime,executor,run,pack,claim,complete};
}

for(const first of ['plan','prepare'])test(`image preparation runs concurrently and hands off after both finish (${first} first)`,async t=>{
  const f=await fixture(t);
  assert.deepEqual(new Set((await f.runtime.next(f.run.run_id)).ready),new Set(['plan','prepare']));
  const [plan,prepare]=await Promise.all([f.claim('plan'),f.claim('prepare')]);
  const dispatch=await f.executor.dispatch(f.run.run_id,{...plan,control_token:f.run.control_token});
  assert.equal(dispatch.adapter.execution,'native_agent');
  assert.equal(dispatch.adapter.spawn_config.agent_type,'default');
  await f.runtime.recordDispatchReceipt(f.run.run_id,{...plan,control_token:f.run.control_token,request_id:dispatch.request_id,receipt:{task_id:'synthetic-planner-fixture'}});
  assert.equal(plan.executor.kind,'provider');assert.equal(prepare.executor.kind,'main');
  assert.equal(plan.access,'read_only');assert.equal(prepare.access,'read_only');
  await assert.rejects(f.claim('produce'),{code:'NODE_NOT_READY'});
  const proposal={prompt:'A red sphere',composition:'Centered',checks:'One red sphere'};
  const preparation={tool:'synthetic image tool',references:'No references',constraints:'Square image'};
  await f.complete(first==='plan'?plan:prepare,first==='plan'?proposal:preparation);
  assert(!(await f.runtime.next(f.run.run_id)).ready.includes('produce'));
  await f.complete(first==='plan'?prepare:plan,first==='plan'?preparation:proposal);
  assert.deepEqual((await f.runtime.next(f.run.run_id)).ready,['produce']);
  const produce=await f.claim('produce');
  assert.equal(produce.executor.kind,'main');assert.equal(produce.access,'bounded_write');
  assert.deepEqual(produce.effective_allowed_paths,['edit']);
  assert.deepEqual(produce.inputs.proposal,proposal);assert.deepEqual(produce.inputs.preparation,preparation);
  const result={artifacts:['edit/example.png'],verification:'Synthetic fixture only; no real image call'};
  await f.complete(produce,result);
  assert.equal((await f.runtime.get(f.run.run_id)).status,'running');
  await f.complete(await f.claim('final'),result,true);
  assert.equal((await f.runtime.get(f.run.run_id)).status,'succeeded');
});

test('failed preparation prevents production, and reinstall preserves user edits',async t=>{
  const f=await fixture(t,'collaborative-task');
  const lease=await f.claim('prepare');
  await f.runtime.failNode(f.run.run_id,{...lease,error:{code:'TOOL_UNAVAILABLE',message:'Synthetic missing tool'}});
  assert.equal((await f.runtime.get(f.run.run_id)).status,'failed');
  await assert.rejects(f.claim('produce'),{code:'NODE_NOT_READY'});
  const workflow={...f.pack.workflow,name:'User customized',status:'draft'};
  const saved=await f.service.call('save',{workflow_id:workflow.id,expected_revision:f.pack.revision_hash,workflow});
  const reopened=await f.service.call('install_preset',{preset_id:'collaborative-task'},{human:true});
  assert.equal(reopened.revision_hash,saved.revision_hash);
  assert.equal(reopened.workflow.name,'User customized');
  await assert.rejects(f.service.call('install_preset',{preset_id:'collaborative-image'}),{code:'HUMAN_PRESET_INSTALL'});
  const config=await f.service.config();const rules=defaultRoutingRules(config.providers);rules.routes.planning.provider_id='removed';
  assert.throws(()=>createWorkflowPreset('collaborative-image',config.providers,rules),{code:'PRESET_PROVIDER_UNAVAILABLE'});
});
