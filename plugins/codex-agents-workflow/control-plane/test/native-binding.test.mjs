import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from './physical-tempdir.mjs';
import { buildProviderAdapter } from '../lib/providers.mjs';
import { WorkflowService } from '../lib/workflow-service.mjs';
import { loadConfig, saveConfig, configRevision } from '../lib/config.mjs';
import { DEFAULT_CONFIG_PATH } from '../server.mjs';
import { useConfigurableNativeProviders } from '../../scripts/use-configurable-native-providers.mjs';

const provider = (agent_type, reasoning_effort) => ({ id:'native-terra',kind:'native_agent',enabled:true,capabilities:{read:true,write:true},config:{agent_type,model:'gpt-5.6-terra',reasoning_effort,role:'implementer',fresh_context:true} });
test('native dispatch preserves configurable effort and never overrides fixed profiles',()=>{
  assert.deepEqual(buildProviderAdapter(provider('default','xhigh'),{access:'bounded_write'}).spawn_config,
    {agent_type:'default',fork_turns:'none',model:'gpt-5.6-terra',reasoning_effort:'xhigh'});
  assert.deepEqual(buildProviderAdapter(provider('codex_workflow_terra_implementer','high'),{access:'bounded_write'}).spawn_config,
    {agent_type:'codex_workflow_terra_implementer',fork_turns:'none'});
  assert.throws(()=>buildProviderAdapter(provider('codex_workflow_terra_implementer','xhigh'),{access:'bounded_write'}),{code:'PROVIDER_ROLE_CONFIG_MISMATCH'});
});

test('registry edits update every dependent Workflow; conflicts and deletion block new Runs while snapshots stay fixed',async t=>{
  const root=await mkdtemp(join(tmpdir(),'provider-binding-'));
  t.after(()=>rm(root,{recursive:true,maxRetries:3,retryDelay:100}));
  const workspace=join(root,'workspace');await mkdir(workspace);
  const configPath=join(root,'control-plane.json');
  await loadConfig({configPath,defaultConfigPath:DEFAULT_CONFIG_PATH});
  const service=new WorkflowService({configPath,defaultConfigPath:DEFAULT_CONFIG_PATH,env:{}});
  await service.call('migrate_v6',{}, {human:true});
  const edit=async change=>{const config=await service.config();const revision=configRevision(config);change(config);await saveConfig(config,{configPath,expectedRevision:revision});};
  const id='judgment-heavy-change';
  // Migration produces Cooperative native nodes.
  const pack=await service.call('read',{workflow_id:id});
  const copy=structuredClone(pack.workflow);copy.id='second-terra-workflow';copy.name='Second Terra workflow';
  await service.call('create',{workflow:copy});
  const start=()=>service.call('start',{workflow_id:id,workspace,access:'bounded_write',allowed_paths:['.'],main_actor:'test',inputs:{task:'fixture',context:'fixture'}});
  const first=await start();
  const pinned=(await (await service.open()).runtime.runs.read(first.run_id)).pins.providers.find(p=>p.id==='native-terra').config;
  await edit(config=>{const p=config.providers.find(p=>p.id==='native-terra');p.config.agent_type='default';p.config.reasoning_effort='xhigh';});
  const second=await start();
  const updated=(await (await service.open()).runtime.runs.read(second.run_id)).pins.providers.find(p=>p.id==='native-terra').config;
  assert.equal(updated.reasoning_effort,'xhigh');
  assert.deepEqual((await (await service.open()).runtime.runs.read(first.run_id)).pins.providers.find(p=>p.id==='native-terra').config,pinned);
  await edit(config=>{config.providers.find(p=>p.id==='native-terra').config.agent_type='codex_workflow_terra_implementer';});
  for(const workflow_id of [id,copy.id])assert((await service.call('read',{workflow_id})).validation.errors.some(e=>e.code==='PROVIDER_ROLE_CONFIG_MISMATCH'));
  await assert.rejects(start(),{code:'WORKFLOW_LAUNCH_BLOCKED'});
  const before=await service.config();
  const migration=await useConfigurableNativeProviders(configPath);
  assert.equal(migration.changed,true);
  const after=await service.config();
  before.providers.find(p=>p.id==='native-terra').config.agent_type='default';
  assert.deepEqual(after,before,'migration must preserve every unrelated setting and selected model/effort');
  assert.equal((await useConfigurableNativeProviders(configPath)).changed,false);
  for(const workflow_id of [id,copy.id])assert.equal((await service.call('read',{workflow_id})).validation.valid,true);
  await edit(config=>{config.providers=config.providers.filter(p=>p.id!=='native-terra');});
  for(const workflow_id of [id,copy.id])assert((await service.call('read',{workflow_id})).validation.errors.some(e=>e.code==='PROVIDER_MISSING'));
  await assert.rejects(start(),{code:'WORKFLOW_LAUNCH_BLOCKED'});
});
