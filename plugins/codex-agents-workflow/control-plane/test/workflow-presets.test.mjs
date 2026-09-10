import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from './physical-tempdir.mjs';
import { WorkflowService } from '../lib/workflow-service.mjs';
import { loadConfig } from '../lib/config.mjs';
import { DEFAULT_CONFIG_PATH } from '../server.mjs';
import { createWorkflowPreset } from '../lib/workflow-presets.mjs';
import { createThreadStartupSmokeWorkflow } from './fixtures/thread-startup-smoke-workflow.mjs';
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
  const complete=(lease,output,accept=false,thread_id)=>runtime.completeNode(run.run_id,{...lease,completion:{status:'succeeded',summary:'Synthetic scheduling evidence',structured_output:output,artifacts:[],evidence:thread_id?[{kind:'codex_thread',thread_id,observed:'completed',dispatch_request_id:'dispatch-'+lease.attempt_id,turn_id:'turn-'+lease.attempt_id}]:[{check:'scheduler fixture'}],changed_paths:[],outside_paths:[],...(accept?{acceptance:{accepted:true}}:{})}});
  return {service,runtime,executor,run,pack,workspace,claim,complete};
}

for(const first of ['plan','prepare'])test(`image preparation runs concurrently and hands off after both finish (${first} first)`,async t=>{
  const f=await fixture(t);
  assert.deepEqual(new Set((await f.runtime.next(f.run.run_id)).ready),new Set(['plan','prepare']));
  const [plan,prepare]=await Promise.all([f.claim('plan'),f.claim('prepare')]);
  const [planDispatch,prepareDispatch]=await Promise.all([
    f.executor.dispatch(f.run.run_id,{...plan,control_token:f.run.control_token}),
    f.executor.dispatch(f.run.run_id,{...prepare,control_token:f.run.control_token}),
  ]);
  for(const dispatch of [planDispatch,prepareDispatch]) {
    assert.equal(dispatch.adapter.execution,'codex_thread');
    assert.equal(dispatch.adapter.lifecycle,'start');
    assert.equal(dispatch.thread_handoff.operation,'create_thread');
    assert.match(dispatch.thread_handoff.title,/Workflow/);
    assert.match(dispatch.thread_handoff.prompt,/Return only the structured node result/);
  }
  await f.runtime.recordDispatchReceipt(f.run.run_id,{...plan,control_token:f.run.control_token,request_id:planDispatch.request_id,receipt:{thread_id:'planner-thread'}});
  await f.runtime.recordDispatchReceipt(f.run.run_id,{...prepare,control_token:f.run.control_token,request_id:prepareDispatch.request_id,receipt:{thread_id:'image-worker-thread'}});
  assert.equal(plan.executor.kind,'thread');assert.equal(prepare.executor.kind,'thread');
  assert.equal(plan.access,'read_only');assert.equal(prepare.access,'read_only');
  await assert.rejects(f.claim('produce'),{code:'NODE_NOT_READY'});
  const proposal={prompt:'A red sphere',composition:'Centered',checks:'One red sphere'};
  const preparation={tool:'synthetic image tool',references:'No references',constraints:'Square image'};
  await assert.rejects(f.complete(plan,proposal),{code:'THREAD_COLLECTION_EVIDENCE'});
  await f.complete(first==='plan'?plan:prepare,first==='plan'?proposal:preparation,false,first==='plan'?'planner-thread':'image-worker-thread');
  assert(!(await f.runtime.next(f.run.run_id)).ready.includes('produce'));
  await f.complete(first==='plan'?prepare:plan,first==='plan'?preparation:proposal,false,first==='plan'?'image-worker-thread':'planner-thread');
  assert.deepEqual((await f.runtime.next(f.run.run_id)).ready,['produce']);
  const produce=await f.claim('produce');
  assert.equal(produce.executor.kind,'thread');assert.equal(produce.access,'bounded_write');
  assert.deepEqual(produce.effective_allowed_paths,['edit']);
  assert.deepEqual(produce.inputs.proposal,proposal);assert.deepEqual(produce.inputs.preparation,preparation);
  const productionDispatch=await f.executor.dispatch(f.run.run_id,{...produce,control_token:f.run.control_token});
  assert.equal(productionDispatch.adapter.execution,'codex_thread');
  assert.equal(productionDispatch.adapter.lifecycle,'continue');
  assert.equal(productionDispatch.thread_handoff.operation,'send_message_to_thread');
  assert.equal(productionDispatch.thread_handoff.thread_id,'image-worker-thread');
  await assert.rejects(f.runtime.recordDispatchReceipt(f.run.run_id,{...produce,control_token:f.run.control_token,request_id:productionDispatch.request_id,receipt:{thread_id:'replacement-thread'}}),{code:'THREAD_IDENTITY_MISMATCH'});
  await f.runtime.recordDispatchReceipt(f.run.run_id,{...produce,control_token:f.run.control_token,request_id:productionDispatch.request_id,receipt:{thread_id:'image-worker-thread'}});
  const result={artifacts:['edit/example.png'],verification:'Synthetic fixture only; no real image call'};
  await f.complete(produce,result,false,'image-worker-thread');
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

test('thread-controlled presets route planning and production to their separate task classes',async t=>{
  const f=await fixture(t);
  const config=await f.service.config(); const rules=defaultRoutingRules(config.providers);
  const task=createWorkflowPreset('collaborative-task',config.providers,rules);
  const image=createWorkflowPreset('collaborative-image',config.providers,rules);
  const byId=workflow=>Object.fromEntries(workflow.nodes.map(node=>[node.id,node]));
  assert.equal(byId(task).plan.executor.provider_id,rules.routes.planning.provider_id);
  assert.equal(byId(task).prepare.executor.provider_id,rules.routes.implementation.provider_id);
  assert.equal(byId(task).produce.executor.provider_id,rules.routes.implementation.provider_id);
  assert.equal(byId(image).plan.executor.provider_id,rules.routes.planning.provider_id);
  assert.equal(byId(image).prepare.executor.provider_id,rules.routes.complex_implementation.provider_id);
  assert.equal(byId(image).produce.executor.provider_id,rules.routes.complex_implementation.provider_id);
});

test('mathematical research hybrid separates parallel one-off probes from a persistent Codex task',async t=>{
  const f=await fixture(t);
  const pack=await f.service.call('install_preset',{preset_id:'mathematical-research-hybrid'},{human:true});
  assert.equal(pack.workflow.status,'ready');
  assert.match(pack.workflow.name,/Mathematical Research/);
  assert.match(pack.workflow.description,/one-off research workers/i);
  assert.equal((await f.service.call('read',{workflow_id:pack.workflow.id})).validation.valid,true);
  const byId=Object.fromEntries(pack.workflow.nodes.map(node=>[node.id,node]));
  assert.deepEqual(['literature_map','toolbox_map','analogy_bridge','counterexample_hunt'].map(id=>byId[id].executor.kind),['provider','provider','provider','provider']);
  assert.deepEqual(['route_probe_a','route_probe_b','route_probe_c'].map(id=>byId[id].executor.kind),['provider','provider','provider']);
  assert.equal(byId.persistent_research_state.executor.kind,'thread');
  assert.equal(byId.persistent_research_state.executor.lifecycle,'start');
  assert.equal(byId.persistent_research_continue.executor.kind,'thread');
  assert.equal(byId.persistent_research_continue.executor.lifecycle,'continue');
  assert.equal(byId.persistent_research_continue.executor.source_node,'persistent_research_state');
  assert.equal(byId.persistent_research_continue.executor.provider_id,byId.persistent_research_state.executor.provider_id);
  assert.equal(byId.persistent_research_state.access,'bounded_write');
  assert.equal(byId.adversarial_review.role,'reviewer');
  assert.equal(byId.adversarial_review.access,'read_only');
  assert.deepEqual(byId.research_mode.cases.map(entry=>entry.label),['persistent']);
  assert.equal(byId.research_mode.default_label,'one_shot');
});

test('production preset catalog excludes smoke and video-use packs',async t=>{
  const f=await fixture(t);
  const config=await f.service.config(); const rules=defaultRoutingRules(config.providers);
  const presets=await f.service.call('presets');
  assert.deepEqual(presets.map(item=>item.id),['collaborative-task','collaborative-image','mathematical-research-hybrid']);
  assert.equal(presets.some(item=>/thread-startup-smoke-test|video-use/i.test(JSON.stringify(item))),false);
  for(const preset of presets){
    const workflow=createWorkflowPreset(preset.id,config.providers,rules);
    assert.deepEqual(workflow.requirements.executables,[]);
    assert.doesNotMatch(JSON.stringify(workflow),/video-use/i);
  }
  await assert.rejects(f.service.call('install_preset',{preset_id:'thread-startup-smoke-test'},{human:true}),{code:'WORKFLOW_PRESET_MISSING'});
  assert.throws(()=>createWorkflowPreset('thread-startup-smoke-test',config.providers,rules),{code:'WORKFLOW_PRESET_MISSING'});
});

test('test-only thread startup smoke fixture reaches a real create-task handoff',async t=>{
  const f=await fixture(t);
  const config=await f.service.config();
  const planning=config.providers.find(provider=>provider.id===defaultRoutingRules(config.providers).routes.planning.provider_id);
  const pack=await f.service.call('create',{workflow:createThreadStartupSmokeWorkflow(planning)});
  assert.equal((await f.service.call('read',{workflow_id:pack.workflow.id})).validation.valid,true);
  assert.equal(pack.workflow.status,'ready');
  assert.match(pack.workflow.name,/Thread startup smoke test/);
  const run=await f.runtime.start({workflow_id:pack.workflow.id,workspace:f.workspace,access:'read_only',allowed_paths:[],main_actor:'root',inputs:{task:'Verify that this English thread Workflow can start.'}});
  assert.deepEqual((await f.runtime.next(run.run_id)).ready,['thread_smoke']);
  const lease=await f.runtime.claimNode(run.run_id,{node_id:'thread_smoke',owner:'root',request_id:'thread-smoke',control_token:run.control_token});
  const dispatch=await f.executor.dispatch(run.run_id,{...lease,control_token:run.control_token});
  assert.equal(dispatch.adapter.execution,'codex_thread');
  assert.equal(dispatch.adapter.lifecycle,'start');
  assert.equal(dispatch.thread_handoff.operation,'create_thread');
  assert.match(dispatch.thread_handoff.title,/Thread startup smoke test/);
  assert.match(dispatch.thread_handoff.prompt,/Do not write files or create another task/i);
});

test('Codex task handoff carries a bounded immutable text snapshot and rejects binary source data',async t=>{
  const f=await fixture(t);
  const workspace=(await f.runtime.get(f.run.run_id)).permissions.workspace;
  const workflow=structuredClone(f.pack.workflow);
  workflow.nodes.find(node=>node.id==='plan').resources=['notes.txt'];
  const textPack=await f.service.call('save',{workflow_id:workflow.id,expected_revision:f.pack.revision_hash,workflow,resources:{'notes.txt':Buffer.from('Keep the visual identity unchanged.')}});
  const textRun=await f.runtime.start({workflow_id:textPack.workflow.id,revision_hash:textPack.revision_hash,workspace,access:'bounded_write',allowed_paths:['edit'],main_actor:'root',inputs:{task:'Synthetic delivery'}});
  const textLease=await f.runtime.claimNode(textRun.run_id,{node_id:'plan',owner:'root',request_id:'resource-text',control_token:textRun.control_token});
  const textDispatch=await f.executor.dispatch(textRun.run_id,{...textLease,control_token:textRun.control_token});
  assert.match(textDispatch.thread_handoff.prompt,/Pinned Workflow source snapshots/);
  assert.match(textDispatch.thread_handoff.prompt,/notes\.txt/);
  assert.match(textDispatch.thread_handoff.prompt,/Keep the visual identity unchanged/);

  const binaryWorkflow=structuredClone(textPack.workflow);
  const binaryPack=await f.service.call('save',{workflow_id:binaryWorkflow.id,expected_revision:textPack.revision_hash,workflow:binaryWorkflow,resources:{'notes.txt':Buffer.from([0xff,0xd8,0xff,0xe0])}});
  const binaryRun=await f.runtime.start({workflow_id:binaryPack.workflow.id,revision_hash:binaryPack.revision_hash,workspace,access:'bounded_write',allowed_paths:['edit'],main_actor:'root',inputs:{task:'Synthetic delivery'}});
  const binaryLease=await f.runtime.claimNode(binaryRun.run_id,{node_id:'plan',owner:'root',request_id:'resource-binary',control_token:binaryRun.control_token});
  await assert.rejects(f.executor.dispatch(binaryRun.run_id,{...binaryLease,control_token:binaryRun.control_token}),{code:'THREAD_RESOURCE_BINARY'});
});
