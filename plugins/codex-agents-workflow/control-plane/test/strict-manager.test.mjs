import { REVIEW_IDS } from '../lib/skill-import/review-checklist.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from './physical-tempdir.mjs';
import { join, resolve } from 'node:path';
import { WorkflowService } from '../lib/workflow-service.mjs';
import { loadConfig, saveConfig } from '../lib/config.mjs';
import { createDraft } from '../lib/workflow-schema.mjs';
import { StrictSessionManager } from '../lib/execution/strict-session-manager.mjs';
import { validateStrictConfig, qualifiedStrictSettings } from '../lib/execution/strict-config.mjs';
import { DEFAULT_CONFIG_PATH } from '../server.mjs';
import { randomUUID } from 'node:crypto';
import { processIdentity } from '../lib/execution/codex-process-ownership.mjs';
import { importCoarseSkill } from '../lib/skill-import/coarse-compiler.mjs';
import { digest } from '../lib/workflow-revisions.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function checklist(proposal, failure='') {
  return {checks:REVIEW_IDS.map(id=>({id,status:failure && id==='hard_rules'?'fail':'pass',evidence:failure && id==='hard_rules'?failure:'Verified source and proposed graph for '+id,node_ids:proposal.nodes.map(n=>n.id),edge_ids:proposal.edges.map(e=>e.id),source_spans:[proposal.nodes[0].source_span]}))};
}

test('explicit blocked model results fail durably rather than advancing success edges',async t=>{
  for(const schema of [{},{type:'object',required:['ok'],properties:{ok:{type:'boolean'}}}]) {
    const f=await fixture(t,{schema,turn:async()=>({output:JSON.stringify({$workflow_blocked:'Required footage and briefing are missing.'}),thread_id:'blocked',turn_id:'blocked',audit:{}})});
    await f.service.call('dispatch',f.args);await f.entry(f.args).job;
    const state=await f.service.call('get',f.args);
    assert.equal(state.status,'failed');assert.equal(state.nodes.work.status,'failed');assert.equal(state.nodes.work.error.code,'WORKFLOW_NODE_BLOCKED');assert.equal(state.nodes.work.error.message,'Required footage and briefing are missing.');
    assert.notEqual(state.nodes.final.status,'ready');assert.equal(state.nodes.work.output,null);assert.equal(state.nodes.work.attempts[0].result_proposal,undefined);assert.equal(f.sessions[0].closed,true);
  }
});

test('generation accepts a non-reviewer registered native model with read-only review and shared prompt contract',async t=>{
  let proposal;
  const f=await fixture(t,{turn:async(settings)=>{const read=await settings.toolBroker.call('read_workflow_resource_range',{path:'source/SKILL.md',start_line:5,end_line:5},'range-read');assert.equal(JSON.parse(read.contentItems[0].text).text,'5: Review result.');return {output:JSON.stringify(settings.model==='gpt-5.6-luna'?checklist(proposal):proposal),thread_id:'selectable-review',turn_id:'turn',audit:{}};}});
  const source=join(f.root,'selectable-source');await mkdir(source);await writeFile(join(source,'SKILL.md'),'---\nname: selectable\ndescription: test\n---\nReview result.');
  const {store}=await f.service.open();const pack=await importCoarseSkill(store,join(source,'SKILL.md'),{id:'selectable-source'});
  const origin={confidence:1,source_span:{resource:'source/SKILL.md',start_line:5,end_line:5}};
  proposal={source_revision:pack.revision_hash,planning_analysis:{parallelism:'Single bounded task; no independent work.',main_responsibilities:'Main accepts; subagent checks.',human_intervention:'Final human confirmation only.'},nodes:[{id:'check',type:'agent',execution_target:'subagent',provider_choice:'native-reviewer',task_type:'review',routing_reason:'Review',prompt_template:'Review',...origin}],edges:[{id:'a',source:'start',target:'check',...origin},{id:'b',source:'check',target:'final',...origin}]};
  const rules=await f.service.call('routing_defaults');rules.generation={review_provider_id:'native-luna',planner_provider_id:'native-terra',max_rounds:3};rules.routes.planning.provider_id='native-luna';
  const input={workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,routing_rules:rules};
  const preview=await f.service.call('generation_prompt_preview',input,{human:true});
  assert.equal(preview.invoked,false);assert.equal(f.sessions.length,0);assert.match(preview.shared_request,/Shared generation and review acceptance contract/);
  const run=await f.service.call('start_generation',{...input,run_id:'selectable-generation'},{human:true});const control={run_id:run.run_id,control_token:run.control_token};
  for(const phase of ['generating','reviewing']){const value=await f.service.call('advance_generation',control,{human:true});assert.equal(value.phase,phase);assert.equal(value.progress.round,1);await Promise.all([...f.manager.entries.values()].map(e=>e.job));}
  const observed=await f.service.call('get',control);const range=observed.nodes.final.attempts[0].executor_events.find(e=>e.kind==='tool_operation' && e.metadata.tool==='read_workflow_resource_range');assert.equal(range.metadata.start_line,5);assert.equal(range.metadata.total_lines,5);assert.equal(range.metadata.end_line,5);
  assert.equal(f.sessions[0].settings.model,'gpt-5.6-terra');assert.equal(f.sessions[1].settings.model,'gpt-5.6-luna');assert.equal(f.sessions[1].settings.toolBroker.tools().some(t=>t.name==='write_workspace'),false);
  assert.equal((await f.service.call('advance_generation',control,{human:true})).phase,'review_required');
  await f.service.call('cancel',control);
});

test('one-click generation prepares workspace and advances only to explicit human acceptance', async t => {
  let proposal;
  const f = await fixture(t,{turn:async(settings)=>({output:JSON.stringify(settings.model==='gpt-5.6-sol'?checklist(proposal):proposal),thread_id:'generation-test',turn_id:'turn',audit:{}})});
  const source = join(f.root,'generate-source'); await mkdir(source);
  await writeFile(join(source,'SKILL.md'),'---\nname: generate\ndescription: Review\n---\nReview a result.');
  const {store} = await f.service.open();
  const pack = await importCoarseSkill(store,join(source,'SKILL.md'),{id:'one-click-source'});
  const origin={confidence:1,source_span:{resource:'source/SKILL.md',start_line:5,end_line:5}};
  proposal={source_revision:pack.revision_hash,planning_analysis:{parallelism:'Single bounded task; no independent work.',main_responsibilities:'Main accepts; subagent checks.',human_intervention:'Final human confirmation only.'},nodes:[{id:'check',type:'agent',prompt_template:'Review',execution_target:'subagent',provider_choice:'native-reviewer',task_type:'review',routing_reason:'Independent review',...origin}],edges:[{id:'a',source:'start',target:'check',...origin},{id:'b',source:'check',target:'final',...origin}]};
  const oldConfig=await f.service.config();oldConfig.providers=oldConfig.providers.filter(p=>p.id!=='native-generation-reviewer');await saveConfig(oldConfig,{configPath:f.configPath});
  const start={workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:'one-click'};
  await assert.rejects(f.service.call('start_generation',start),{code:'HUMAN_GENERATION'});
  const run=await f.service.call('start_generation',start,{human:true});
  const control={run_id:run.run_id,control_token:run.control_token};
  const stateBefore=await f.service.call('get',control);
  assert(stateBefore.permissions.workspace.includes('skill-generation-workspaces'));
  await assert.rejects(f.service.call('accept_generation',{...control,accepted:true},{human:true}),{code:'GENERATION_NOT_READY'});
  for(const phase of ['generating','reviewing']) {
    const progress=await f.service.call('advance_generation',control,{human:true}); assert.equal(progress.phase,phase);
    await Promise.all([...f.manager.entries.values()].map(entry=>entry.job));
  }
  const preview=await f.service.call('advance_generation',control,{human:true});
  assert.equal(preview.phase,'review_required');
  assert.equal(preview.validation.valid,true);
  assert.equal(f.sessions[1].settings.model,'gpt-5.6-sol');
  assert.equal(f.sessions[1].settings.effort,'high');
  assert.equal(preview.workflow.finalization.required,true);
  assert.equal(preview.workflow.nodes.find(n=>n.id==='check').executor.provider_id,'native-reviewer');
  assert.equal((await store.snapshot(pack.workflow.id)).revision_hash,pack.revision_hash);
  await assert.rejects(f.service.call('accept_generation',{...control,accepted:false},{human:true}),{code:'GENERATION_ACCEPTANCE'});
  const saved=await f.service.call('accept_generation',{...control,accepted:true},{human:true});
  assert.equal(saved.workflow.status,'draft'); assert.notEqual(saved.revision_hash,pack.revision_hash);
  assert(saved.workflow.nodes.filter(n=>n.origin?.kind==='inferred').every(n=>n.origin.reviewed));
  assert(saved.workflow.edges.filter(n=>n.origin?.kind==='inferred').every(n=>n.origin.reviewed));
  assert(!saved.workflow.import_status.unresolved.some(i=>i.code==='AI_INFERENCES_REQUIRE_REVIEW'));
  assert.equal(f.sessions.length,2);
});

test('an invented automatic Provider is repaired before review without an endless error state',async t=>{
  let proposal;let generated=0;
  const f=await fixture(t,{turn:async settings=>{
    const value=settings.model==='gpt-5.6-sol'?checklist(proposal):structuredClone(proposal);
    if(value.nodes && generated++===0)value.nodes[0].provider_choice='invented-provider';
    return {output:JSON.stringify(value),thread_id:'routing-repair',turn_id:'turn',audit:{}};
  }});
  const source=join(f.root,'routing-repair');await mkdir(source);await writeFile(join(source,'SKILL.md'),'---\nname: routing-repair\ndescription: Review\n---\nReview a result.');
  const {store}=await f.service.open();const pack=await importCoarseSkill(store,join(source,'SKILL.md'),{id:'routing-repair'});
  const origin={confidence:1,source_span:{resource:'source/SKILL.md',start_line:5,end_line:5}};
  proposal={source_revision:pack.revision_hash,planning_analysis:{parallelism:'One task.',main_responsibilities:'Main accepts.',human_intervention:'Final confirmation.'},nodes:[{id:'check',type:'agent',execution_target:'subagent',provider_choice:'native-reviewer',task_type:'review',routing_reason:'Independent review',prompt_template:'Review',...origin}],edges:[{id:'a',source:'start',target:'check',...origin},{id:'b',source:'check',target:'final',...origin}]};
  const run=await f.service.call('start_generation',{workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:'routing-repair'},{human:true});const control={run_id:run.run_id,control_token:run.control_token};
  for(const phase of ['generating','repairing','generating','reviewing','review_required']){
    assert.equal((await f.service.call('advance_generation',control,{human:true})).phase,phase);
    await Promise.all([...f.manager.entries.values()].map(e=>e.job));
  }
  assert.equal(generated,2);await f.service.call('cancel',control);
});
test('an invalid review checklist retries only the reviewer and preserves the generated graph',async t=>{
  let proposal;let generated=0;let reviews=0;
  const f=await fixture(t,{turn:async settings=>{
    const value=settings.model==='gpt-5.6-sol'?checklist(proposal):structuredClone(proposal);
    if(value.nodes)generated++;else if(reviews++===0)value.checks[1].id=value.checks[0].id;
    return {output:JSON.stringify(value),thread_id:'routing-repair',turn_id:'turn',audit:{}};
  }});
  const source=join(f.root,'routing-repair');await mkdir(source);await writeFile(join(source,'SKILL.md'),'---\nname: routing-repair\ndescription: Review\n---\nReview a result.');
  const {store}=await f.service.open();const pack=await importCoarseSkill(store,join(source,'SKILL.md'),{id:'routing-repair'});
  const origin={confidence:1,source_span:{resource:'source/SKILL.md',start_line:5,end_line:5}};
  proposal={source_revision:pack.revision_hash,planning_analysis:{parallelism:'One task.',main_responsibilities:'Main accepts.',human_intervention:'Final confirmation.'},nodes:[{id:'check',type:'agent',execution_target:'subagent',provider_choice:'native-reviewer',task_type:'review',routing_reason:'Independent review',prompt_template:'Review',...origin}],edges:[{id:'a',source:'start',target:'check',...origin},{id:'b',source:'check',target:'final',...origin}]};
  const run=await f.service.call('start_generation',{workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:'routing-repair'},{human:true});const control={run_id:run.run_id,control_token:run.control_token};
  for(const phase of ['generating','reviewing','repairing','reviewing','review_required']){
    assert.equal((await f.service.call('advance_generation',control,{human:true})).phase,phase);
    await Promise.all([...f.manager.entries.values()].map(e=>e.job));
  }
  assert.equal(generated,1);assert.equal(reviews,2);const state=await f.service.call('get',control);assert.equal(state.nodes.expand.attempts.length,1);assert.equal(state.nodes.final.attempts.length,2);await f.service.call('cancel',control);
});
test('a schema-invalid review retries only the reviewer after the failed session closes',async t=>{
  let proposal;let generated=0;let reviews=0;
  const f=await fixture(t,{turn:async settings=>{
    const value=settings.model==='gpt-5.6-sol'?checklist(proposal):structuredClone(proposal);
    if(value.nodes)generated++;else if(reviews++===0)value.checks.pop();
    return {output:JSON.stringify(value),thread_id:'routing-repair',turn_id:'turn',audit:{}};
  }});
  const source=join(f.root,'routing-repair');await mkdir(source);await writeFile(join(source,'SKILL.md'),'---\nname: routing-repair\ndescription: Review\n---\nReview a result.');
  const {store}=await f.service.open();const pack=await importCoarseSkill(store,join(source,'SKILL.md'),{id:'routing-repair'});
  const origin={confidence:1,source_span:{resource:'source/SKILL.md',start_line:5,end_line:5}};
  proposal={source_revision:pack.revision_hash,planning_analysis:{parallelism:'One task.',main_responsibilities:'Main accepts.',human_intervention:'Final confirmation.'},nodes:[{id:'check',type:'agent',execution_target:'subagent',provider_choice:'native-reviewer',task_type:'review',routing_reason:'Independent review',prompt_template:'Review',...origin}],edges:[{id:'a',source:'start',target:'check',...origin},{id:'b',source:'check',target:'final',...origin}]};
  const run=await f.service.call('start_generation',{workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:'routing-repair'},{human:true});const control={run_id:run.run_id,control_token:run.control_token};
  for(const phase of ['generating','reviewing','repairing','reviewing','review_required']){
    assert.equal((await f.service.call('advance_generation',control,{human:true})).phase,phase);
    await Promise.all([...f.manager.entries.values()].map(e=>e.job));
  }
  assert.equal(generated,1);assert.equal(reviews,2);const state=await f.service.call('get',control);assert.equal(state.nodes.expand.attempts.length,1);assert.equal(state.nodes.final.attempts.length,2);await f.service.call('cancel',control);
});
test('one-click generation exposes managed login without silently starting a model', async t => {
  const f = await fixture(t,{authenticated:false});
  const source=join(f.root,'login-source'); await mkdir(source);
  await writeFile(join(source,'SKILL.md'),'---\nname: login\ndescription: Review\n---\nReview a result.');
  const {store}=await f.service.open();
  const pack=await importCoarseSkill(store,join(source,'SKILL.md'),{id:'login-source'});
  const run=await f.service.call('start_generation',{workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:'login-generation'},{human:true});
  const control={run_id:run.run_id,control_token:run.control_token};
  await f.service.call('advance_generation',control,{human:true});
  const progress=await f.service.call('advance_generation',control,{human:true});
  assert.equal(progress.phase,'authentication_required');
  assert.equal(progress.live.status,'auth_required');
  assert.equal(f.sessions[0].calls,0);
  await assert.rejects(f.service.call('login_generation',control),{code:'HUMAN_AUTHENTICATION_REQUIRED'});
  await assert.rejects(f.service.call('login_generation',{...control,control_token:'wrong'},{human:true}));
  const session=f.sessions[0];
  session.login=async()=>({login_id:'test-login',auth_url:'https://auth.openai.com/test-only'});
  session.client.waitFor=async(predicate)=>{
    const event=[{method:'account/login/completed',params:{loginId:'test-login',success:true}},{method:'account/updated',params:{authMode:'chatgpt'}}].find(predicate);
    session.client.events.push(event);return event;
  };
  session.turn=async()=>{throw new Error('Synthetic stop after successful login handoff');};
  const login=await f.service.call('login_generation',control,{human:true});
  assert.equal(login.auth_url,'https://auth.openai.com/test-only');
  assert.equal(login.status,'auth_pending');

  await f.service.call('cancel',control);
});
test('generation repairs review findings with pinned providers and preserves rejected attempts', async t => {
  let proposal, reviews=0; const prompts=[];
  const f=await fixture(t,{turn:async(settings,session)=>{prompts.push(session.prompt);return {output:JSON.stringify(settings.model==='gpt-5.6-sol'?checklist(proposal,++reviews>1?'':'Clarify the review deliverable.'):proposal),thread_id:'repair',turn_id:'round',audit:{}};}});
  const config=await f.service.config();config.providers.find(p=>p.id==='native-generation-reviewer').requires_user_approval=true;await saveConfig(config,{configPath:f.configPath});
  const source=join(f.root,'repair-source');await mkdir(source);await writeFile(join(source,'SKILL.md'),'---\nname: repair\ndescription: Review\n---\nReview result.');
  const {store}=await f.service.open();const pack=await importCoarseSkill(store,join(source,'SKILL.md'),{id:'repair-source'});
  const origin={confidence:1,source_span:{resource:'source/SKILL.md',start_line:5,end_line:5}};
  proposal={source_revision:pack.revision_hash,planning_analysis:{parallelism:'Single bounded task; no independent work.',main_responsibilities:'Main accepts; subagent checks.',human_intervention:'Final human confirmation only.'},nodes:[{id:'check',type:'agent',execution_target:'subagent',provider_choice:'native-reviewer',task_type:'review',routing_reason:'Review',prompt_template:'Review',...origin}],edges:[{id:'a',source:'start',target:'check',...origin},{id:'b',source:'check',target:'final',...origin}]};
  const run=await f.service.call('start_generation',{workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:'repair-generation'},{human:true});const control={run_id:run.run_id,control_token:run.control_token};
  async function step(){const result=await f.service.call('advance_generation',control,{human:true});await Promise.all([...f.manager.entries.values()].map(e=>e.job));return result;}
  assert.equal((await step()).phase,'generating');const approval=await step();assert.equal(approval.phase,'approval');await f.service.call('approve',{...control,approval_id:approval.approvals[0].id,decision:true});assert.equal((await step()).phase,'reviewing');
  await assert.rejects(f.service.call('accept_generation',{...control,accepted:true},{human:true}),{code:'GENERATION_REVIEW_BLOCKED'});
  assert.equal((await step()).phase,'repairing');
  assert.equal((await step()).phase,'generating');const nextApproval=await step();assert.equal(nextApproval.phase,'approval');await f.service.call('approve',{...control,approval_id:nextApproval.approvals[0].id,decision:true});assert.equal((await step()).phase,'reviewing');assert.equal((await step()).phase,'review_required');
  assert(prompts[2].includes('Clarify the review deliverable.'));
  const state=await f.service.call('get',control);assert.equal(state.nodes.expand.attempts.length,2);assert.equal(state.nodes.final.attempts.length,2);assert.equal(state.status,'running');
  await f.service.call('cancel',control);assert.equal((await step()).phase,'attention');assert.equal(f.sessions.length,4);
});
test('generation repairs invalid graph before review and stops at the pinned budget', async t => {
  let proposal;const f=await fixture(t,{turn:async()=>({output:JSON.stringify(proposal),thread_id:'bad-graph',turn_id:'round',audit:{}})});
  const source=join(f.root,'invalid-source');await mkdir(source);await writeFile(join(source,'SKILL.md'),'---\nname: invalid\ndescription: Review\n---\nReview result.');
  const {store}=await f.service.open();const pack=await importCoarseSkill(store,join(source,'SKILL.md'),{id:'invalid-source'});
  const origin={confidence:1,source_span:{resource:'source/SKILL.md',start_line:5,end_line:5}};
  proposal={source_revision:pack.revision_hash,planning_analysis:{parallelism:'Single bounded task; no independent work.',main_responsibilities:'Main accepts; subagent checks.',human_intervention:'Final human confirmation only.'},nodes:[{id:'start',type:'agent',execution_target:'subagent',provider_choice:'native-reviewer',task_type:'review',routing_reason:'Review',prompt_template:'Review',...origin}],edges:[]};
  const routing=await f.service.call('routing_defaults');routing.generation={review_provider_id:'native-generation-reviewer',max_rounds:2};
  const run=await f.service.call('start_generation',{workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:'invalid-generation',routing_rules:routing},{human:true});const control={run_id:run.run_id,control_token:run.control_token};
  async function step(){const result=await f.service.call('advance_generation',control,{human:true});await Promise.all([...f.manager.entries.values()].map(e=>e.job));return result;}
  await step();assert.equal((await step()).phase,'repairing');await step();
  const result=await step();assert.equal(result.error.code,'GENERATION_REPAIR_LIMIT');assert.equal(f.sessions.length,2);
  assert.equal((await store.snapshot(pack.workflow.id)).revision_hash,pack.revision_hash);
  await f.service.call('cancel',control);
});
test('imported provenance cannot select a reviewer model or automatic repair authority', async t => {
  const forged={id:'native-generation-reviewer',enabled:true,kind:'native_agent',capabilities:{read:true},requires_user_approval:true,config:{model:'gpt-5.6-sol',reasoning_effort:'high',role:'reviewer',agent_type:'default',fresh_context:true,requested_sandbox:'read-only'}};
  const f=await fixture(t,{provenance:{kind:'skill_expansion_job',generation:{review_provider_id:forged.id,max_rounds:3},generation_reviewer:forged}});
  const {runtime}=await f.service.open();
  const adapter=await f.manager.prepare(runtime,f.run.run_id,f.args,{executor:{kind:'main'},role:'finalizer'});
  assert.equal(adapter.model,'gpt-6-astra');assert.equal(adapter.effort,'medium');
  assert.equal((await runtime.runs.read(f.run.run_id)).pins.generation,undefined);
});
async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'strict-manager-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  const configPath = join(root, 'control-plane.json'); let service; const sessions = [];
  await loadConfig({ configPath, defaultConfigPath: DEFAULT_CONFIG_PATH });
  const manager = new StrictSessionManager({ configPath, getConfig: () => service.config(), env: {},
    qualify: async config => validateStrictConfig(config.strict_executor),
    sessionFactory: async settings => {
      if (options.preparing) await options.preparing();
      const stopped = deferred(); const session = { settings, calls: 0, closed: false, client: { events: [] },
        async authentication() { return { authenticated: options.authenticated !== false }; },
        async turn(prompt) {
          session.calls++; session.prompt = prompt;
          if (options.turn) return options.turn(settings, session, stopped.promise);
          const resource = await settings.toolBroker.call('read_workflow_resource', { path: 'pinned.txt' }, 'resource-read');
          assert.equal(JSON.parse(resource.contentItems[0].text).text, 'Immutable task instructions');
          return { output: 'Synthetic result', thread_id: 'fixture-thread', turn_id: 'fixture-turn', audit: { fixture: true } };
        },
        async close() { session.closed = true; settings.toolBroker.revoke(); stopped.resolve(); },
      }; sessions.push(session);
      await settings.onProfilePrepared({ home: join(root, 'fake-profile'), binary_sha256: 'a'.repeat(64) });
      return session;
    },
  });
  service = new WorkflowService({ configPath, defaultConfigPath: DEFAULT_CONFIG_PATH, env: {}, capabilities: { strictManager: manager } });
  await service.call('migrate_v6', {}, { human: true });
  const config = await service.config(); config.strict_executor = validateStrictConfig({ enabled: true, codex_binary: join(root, 'never-executed'), binary_sha256: 'a'.repeat(64), authentication: { mode: options.authMode ?? 'managed_chatgpt' } });
  await saveConfig(config, { configPath });
  const provider = config.providers.find(item => item.enabled && item.kind === 'native_agent');
  const workflow = { ...createDraft('strict-test', 'Strict manager test'), status: 'ready', finalization: { required: true, node_id: 'final' } };
  const common = { type: 'agent', access: options.write ? 'bounded_write' : 'read_only', ...(options.write ? { path_scope: ['out.txt'] } : {}), approval: { required: false }, retry: { max_attempts: 1 }, input_bindings: {}, prompt_template: '{{task}}', resources: ['pinned.txt'] };
  workflow.nodes = [{ id: 'start', type: 'start' }, { ...common, id: 'work', role: provider.config.role, executor: { kind: 'provider', provider_id: provider.id }, ...(options.schema ? { outputs_schema: options.schema } : {}) },
    { ...common, id: 'final', role: 'finalizer', access: 'read_only', executor: { kind: 'main' } }, { id: 'end', type: 'end' }];
  workflow.edges = [['start', 'work'], ['work', 'final'], ['final', 'end']].map(([source, target]) => ({ id: source + '-' + target, source, target }));
  await service.call('create', { workflow, ...(options.provenance ? {provenance:options.provenance} : {}), resources: { 'pinned.txt': 'Immutable task instructions' } });
  const run = await service.call('start', { workflow_id: workflow.id, workspace, access: options.write ? 'bounded_write' : 'read_only', ...(options.write ? { allowed_paths: ['out.txt'] } : {}), main_actor: 'root', inputs: { task: 'Synthetic only' } });
  const claim = async (node = 'work') => {
    const lease = await service.call('claim_node', { run_id: run.run_id, control_token: run.control_token, node_id: node, owner: node === 'final' ? 'root' : 'worker', request_id: 'claim-' + node });
    return { run_id: run.run_id, control_token: run.control_token, node_id: node, attempt_id: lease.attempt_id, lease_token: lease.lease_token };
  };
  const args = await claim();
  const entry = args => manager.entries.get(args.run_id + '/' + args.attempt_id);
  t.after(async () => { await manager.close(); assert(resolve(root).startsWith(resolve(tmpdir()))); await rm(root, { recursive: true, maxRetries: 3, retryDelay: 100 }); });
  return { root, workspace, configPath, service, manager, sessions, run, claim, args, entry };
}

test('Strict settings are opt-in, reject secrets/unknown fields and never turn arbitrary hashes into capability', async () => {
  assert.equal(validateStrictConfig().enabled, false);
  assert.equal(validateStrictConfig().authentication.mode, 'host_chatgpt');
  assert.throws(() => validateStrictConfig({ authentication: { api_key: 'secret' } }), { code: 'STRICT_CONFIG' });
  assert.throws(() => validateStrictConfig({ enabled: true }), { code: 'STRICT_CONFIG' });
  assert.equal(validateStrictConfig({ main_model: 'gpt-5.6-luna' }).main_model, 'gpt-5.6-luna');
  assert.equal(validateStrictConfig({ main_model: 'future-model', main_reasoning_effort: 'medium' }).main_model, 'future-model');
  assert.equal(validateStrictConfig().main_model, 'gpt-6-astra');
  assert.equal(validateStrictConfig().main_reasoning_effort, 'medium');
  assert.throws(() => validateStrictConfig({ main_model: '' }), { code: 'STRICT_CONFIG' });
  assert.throws(() => validateStrictConfig({ main_reasoning_effort: '' }), { code: 'STRICT_CONFIG' });
  await assert.rejects(qualifiedStrictSettings({ strict_executor: { enabled: true, codex_binary: resolve('fake.exe'), binary_sha256: 'a'.repeat(64) } }), { code: 'STRICT_EXECUTOR_UNQUALIFIED' });
});

test('host authentication failure closes the node without offering managed login or starting a turn', async t => {
  const f = await fixture(t, { authenticated: false, authMode: 'host_chatgpt' });
  await assert.rejects(f.service.call('dispatch', f.args), { code: 'HOST_AUTH_UNAVAILABLE' });
  assert.equal(f.sessions[0].calls, 0);
  assert.equal(f.sessions[0].closed, true);
  assert.equal(f.entry(f.args).status, 'failed');
});

test('human recovery fences and closes a waiting Strict session with rotated audit authority', async t => {
  const f = await fixture(t, { authenticated: false }); await f.service.call('dispatch', f.args);
  const state = await f.service.call('get', { run_id: f.run.run_id });
  const adopted = await f.service.call('adopt_run', { run_id: f.run.run_id, expected_sequence: state.sequence, reason: 'Synthetic lost console', main_actor: 'human-console' }, { human: true });
  assert.deepEqual(adopted.recovery_errors, []); assert.equal(adopted.nodes.work.status, 'interrupted'); assert(f.sessions[0].closed);
  assert.equal(f.entry(f.args).status, 'stopped');
  await assert.rejects(f.service.call('strict_login', f.args, { human: true }), { code: 'RUN_AUTHORITY' });
  await assert.rejects(f.service.call('recover_strict_result', { run_id: adopted.run_id, control_token: adopted.control_token, node_id: 'work', attempt_id: f.args.attempt_id }), { code: 'STRICT_RESULT_PENDING' });
  assert.equal(f.sessions[0].calls, 0);
});

test('a durable final Strict proposal survives controller loss and reattaches without another model call', async t => {
  const f = await fixture(t); await f.service.call('dispatch', f.args); await f.entry(f.args).job;
  const final = await f.claim('final'); await f.service.call('dispatch', final); await f.entry(final).job;
  const before = await f.service.call('get', { run_id: f.run.run_id });
  const adopted = await f.service.call('adopt_run', { run_id: f.run.run_id, expected_sequence: before.sequence, reason: 'Synthetic final review recovery', main_actor: 'human-console' }, { human: true }); assert.deepEqual(adopted.recovery_errors, []);
  const restored = await f.service.call('recover_strict_result', { run_id: adopted.run_id, control_token: adopted.control_token, node_id: 'final', attempt_id: final.attempt_id });
  await f.service.call('resume', { run_id: adopted.run_id, control_token: adopted.control_token });
  const args = { ...restored.envelope, control_token: adopted.control_token };
  assert.equal((await f.service.call('collect_strict', args)).final_acceptance_required, true);
  const completed = await f.service.call('collect_strict', { ...args, accepted: true }); assert.equal(completed.status, 'succeeded');
  assert.equal(f.sessions.reduce((sum, session) => sum + session.calls, 0), 2); assert.equal(completed.nodes.final.attempts.length, 1);
});

test('Strict child service dispatch reads its pinned Pack and collects only accepted output into its parent', async t => {
  const f = await fixture(t); const childPack = await f.service.call('read', { workflow_id: 'strict-test' });
  const parentWorkflow = structuredClone(childPack.workflow); parentWorkflow.id = 'strict-parent';
  Object.assign(parentWorkflow.nodes[1], { type: 'subworkflow', executor: { kind: 'subworkflow' }, input_bindings: { task: '/inputs/task' },
    subworkflow: { workflow_id: childPack.workflow.id, revision_pin: childPack.revision_hash, output_bindings: { child_result: '/output' } } });
  await f.service.call('create', { workflow: parentWorkflow, resources: { 'pinned.txt': 'Immutable task instructions' } });
  const parent = await f.service.call('start', { workflow_id: parentWorkflow.id, workspace: f.workspace, access: 'read_only', main_actor: 'root', inputs: { task: 'Nested synthetic task' } });
  const claimFor = async (run, nodeId) => {
    const lease = await f.service.call('claim_node', { run_id: run.run_id, control_token: run.control_token, node_id: nodeId, owner: nodeId === 'final' ? 'root' : 'worker', request_id: 'claim-' + nodeId });
    return { run_id: run.run_id, control_token: run.control_token, node_id: nodeId, attempt_id: lease.attempt_id, lease_token: lease.lease_token };
  };
  const parentArgs = await claimFor(parent, 'work');
  await f.service.call('delete', { workflow_id: childPack.workflow.id, expected_revision: childPack.revision_hash });
  const child = (await f.service.call('dispatch', parentArgs)).child;
  assert.equal(f.sessions.length, 0);
  for (const nodeId of ['work', 'final']) {
    const request = await claimFor(child, nodeId); await f.service.call('dispatch', request); await f.entry(request).job;
    if (nodeId === 'final') await f.service.call('collect_strict', { ...request, accepted: true });
  }
  const collected = await f.service.call('collect_subworkflow', parentArgs);
  assert.deepEqual(collected.nodes.work.output, { child_result: { text: 'Synthetic result' } }); assert.equal(f.sessions.length, 2);
  assert(f.sessions.every(session => !session.prompt.includes(parent.control_token) && !session.prompt.includes(child.control_token)));
  const finalArgs = await claimFor(parent, 'final'); await f.service.call('dispatch', finalArgs); await f.entry(finalArgs).job;
  assert.equal((await f.service.call('collect_strict', { ...finalArgs, accepted: true })).status, 'succeeded');
});

test('streamed output is a bounded unverified preview and only progress metadata enters the durable journal', async t => {
  const ready = deferred(); const release = deferred(); const marker = 'PREVIEW_ONLY_DO_NOT_JOURNAL_';
  t.after(() => release.resolve());
  const f = await fixture(t, { async turn(settings) {
    await settings.onOutput({ delta: marker + 'x'.repeat(40000) });
    await settings.onOutput({ delta: 'TAIL' }); ready.resolve(); await release.promise;
    return { output: 'Accepted durable result', thread_id: 'fixture-thread', turn_id: 'fixture-turn', audit: { fixture: true } };
  } });
  await f.service.call('dispatch', f.args);
  await Promise.race([ready.promise, f.entry(f.args).job.then(() => { throw new Error(JSON.stringify(f.entry(f.args).error ?? 'Turn ended before preview')); })]);
  const live = await f.service.call('strict_status', f.args);
  assert.equal(live.output_preview.text.length, 32768); assert(live.output_preview.text.endsWith('TAIL'));
  assert.equal(live.output_preview.characters, marker.length + 40004); assert.equal(live.output_preview.truncated, true);
  assert.equal(live.output_preview.verified, false); assert.equal(live.output_preview.durable, false);
  const { runtime } = await f.service.open(); const events = JSON.stringify((await runtime.runs.read(f.run.run_id)).events);
  assert(events.includes('output_progress')); assert(!events.includes(marker)); assert(!events.includes('TAIL'));
  release.resolve(); await f.entry(f.args).job;
  assert.deepEqual((await f.service.call('get', f.args)).nodes.work.output, { text: 'Accepted durable result' });
});
test('Strict dispatch runs pinned resources exactly once and keeps final acceptance in the main controller', async t => {
  const f = await fixture(t); const dispatched = await f.service.call('dispatch', f.args);
  assert.equal(dispatched.dispatched, true); await f.entry(f.args).job;
  assert.equal((await f.service.call('strict_status', f.args)).status, 'succeeded');
  assert.equal(f.sessions[0].prompt.includes(f.run.control_token), false); assert.equal(f.sessions[0].closed, true);
  assert.equal((await f.service.call('dispatch', f.args)).idempotent, true); assert.equal(f.sessions[0].calls, 1);
  const final = await f.claim('final'); await f.service.call('dispatch', final); await f.entry(final).job;
  const proposed = await f.service.call('collect_strict', final); assert.equal(proposed.final_acceptance_required, true);
  assert.notEqual((await f.service.call('get', f.args)).status, 'succeeded');
  await assert.rejects(f.service.call('collect_strict', { ...final, control_token: 'wrong', accepted: true }), { code: 'RUN_AUTHORITY' });
  assert.equal((await f.service.call('collect_strict', { ...final, accepted: true })).status, 'succeeded');
  assert.equal((await f.service.call('collect_strict', { ...final, accepted: true })).idempotent, true);
});

test('settled Strict entries release heavyweight session references while retaining status', async t => {
  const f = await fixture(t);
  await f.service.call('dispatch', f.args);
  await f.entry(f.args).job;
  const entry = f.entry(f.args);
  assert.equal(entry.status, 'succeeded');
  assert.equal(entry.session, null);
  assert.equal(entry.broker, null);
  assert.equal(entry.envelope, null);
  assert.equal(entry.prompt, null);
  assert.equal(entry.runtime, null);
  assert.equal(entry.job, null);
  assert.equal((await f.service.call('strict_status', f.args)).status, 'succeeded');
});

test('pending managed authentication exposes status without URLs or dispatching a model; cancellation closes it', async t => {
  const f = await fixture(t, { authenticated: false }); await f.service.call('dispatch', f.args);
  assert.equal((await f.service.call('strict_status', f.args)).status, 'auth_required'); assert.equal(f.sessions[0].calls, 0);
  await assert.rejects(f.service.call('strict_login', f.args), { code: 'HUMAN_AUTHENTICATION_REQUIRED' });
  const cancelled = await f.service.call('cancel', f.args); assert.equal(cancelled.status, 'cancelled');
  assert.equal(f.sessions[0].closed, true); assert.equal(cancelled.nodes.work.attempts[0].dispatch.cancellation_pending, false);
});

test('cancellation fences a pending model write before reporting its local session stopped', async t => {
  const entered = deferred(); let writeError;
  const f = await fixture(t, { write: true, turn: async (settings, _session, stopped) => {
    entered.resolve(); await stopped;
    try { await settings.toolBroker.call('write_workspace', { path: 'out.txt', text: 'Late write', expected_sha256: null }, 'late-write'); }
    catch (error) { writeError = error; throw error; }
  } });
  await f.service.call('dispatch', f.args); await entered.promise;
  const state = await f.service.call('cancel', f.args);
  assert.equal(state.status, 'cancelled'); assert.equal(writeError.code, 'CODEX_BROKER_REVOKED');
  await assert.rejects(readFile(join(f.workspace, 'out.txt')), { code: 'ENOENT' });
});

test('pause permits an already running node to finish, while schema violations fail explicitly', async t => {
  const entered = deferred(); const released = deferred();
  const f = await fixture(t, { turn: async () => { entered.resolve(); await released.promise; return { output: 'Finished', thread_id: 't', turn_id: 'u', audit: {} }; } });
  await f.service.call('dispatch', f.args); await entered.promise; await f.service.call('pause', f.args); released.resolve(); await f.entry(f.args).job;
  const state = await f.service.call('get', f.args); assert.equal(state.status, 'paused'); assert.equal(state.nodes.work.status, 'succeeded');
  const bad = await fixture(t, { schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } } });
  await bad.service.call('dispatch', bad.args); await bad.entry(bad.args).job;
  assert.equal((await bad.service.call('get', bad.args)).nodes.work.error.code, 'STRICT_OUTPUT_JSON');
});

test('a durable result survives completion failure and can be collected without another invocation or retry', async t => {
  const entered = deferred(); const released = deferred();
  const f = await fixture(t, { turn: async () => { entered.resolve(); await released.promise; return { output: 'Preserved', thread_id: 't', turn_id: 'u', audit: {} }; } });
  await f.service.call('dispatch', f.args); await entered.promise;
  const runsDirectory = f.entry(f.args).runtime.runs.directory(f.run.run_id);
  f.entry(f.args).runtime.completeNode = async () => { throw Object.assign(new Error('Synthetic commit fault'), { code: 'SYNTHETIC_COMMIT_FAULT' }); };
  released.resolve(); await f.entry(f.args).job;
  assert.equal((await f.service.call('strict_status', f.args)).status, 'result_commit_failed');
  const state = await f.service.call('collect_strict', f.args); assert.equal(state.nodes.work.status, 'succeeded');
  assert.equal(state.nodes.work.attempts.length, 1); assert.equal(f.sessions[0].calls, 1);
  const proposal = state.nodes.work.attempts[0].result_proposal;
  await writeFile(join(runsDirectory, proposal.artifact), '{}');
  await assert.rejects(f.service.call('collect_strict', f.args), { code: 'EXECUTOR_RESULT_CORRUPT' });
});

test('cancelling during session preparation waits for that owned preparation to settle', async t => {
  const entered = deferred(); const released = deferred();
  const f = await fixture(t, { preparing: async () => { entered.resolve(); await released.promise; } });
  const dispatch = f.service.call('dispatch', f.args); const dispatchFailure = assert.rejects(dispatch, { code: 'STRICT_SESSION_STOPPED' });
  await entered.promise; const stopping = deferred(); const originalStop = f.manager.stopRun.bind(f.manager);
  f.manager.stopRun = id => { stopping.resolve(); return originalStop(id); };
  const cancel = f.service.call('cancel', f.args); const completed = Promise.all([dispatchFailure, cancel]);
  // Fence publication is observed before permitting session setup to return.
  await stopping.promise;
  try { assert.equal((await f.service.call('get', f.args)).status, 'cancelled'); } finally { released.resolve(); }
  const results = await completed; assert.equal(results[1].status, 'cancelled'); assert.equal(f.sessions[0].closed, true);
  assert.equal(f.sessions[0].calls, 0);
});

test('orphan cleanup selects exact Run/node/attempt ownership and refuses a live owner', async t => {
  const f = await fixture(t, { authenticated: false }); await f.service.call('dispatch', f.args);
  await f.service.call('cancel', f.args); await mkdir(f.manager.parent, { recursive: true });
  const active = join(f.manager.parent, 'strict-node-active'); const orphan = join(f.manager.parent, 'strict-node-orphan'); const other = join(f.manager.parent, 'strict-node-other');
  const supported = ['win32', 'linux'].includes(process.platform);
  if (!supported) await assert.rejects(processIdentity(process.pid), { code: 'PROCESS_IDENTITY_UNSUPPORTED' });
  const identity = supported ? await processIdentity(process.pid) : { pid: process.pid, started: 'synthetic-unqualified', executable: process.execPath };
  for (const home of [active, orphan, other]) {
    await mkdir(home);
    const parentIdentity = home === active ? identity : { pid: 999999999, started: 'synthetic-dead-parent', executable: process.execPath };
    await writeFile(join(home, 'owner.json'), JSON.stringify({ schema_version: 1, token: randomUUID(), parent_pid: parentIdentity.pid, parent_identity: parentIdentity, child_pid: null,
      owner: { run_id: home === other ? 'another-run' : f.run.run_id, node_id: f.args.node_id, attempt_id: f.args.attempt_id } }));
  }
  const result = await f.service.call('cleanup_strict_orphans', f.args);
  if (!supported) {
    assert.deepEqual(result.cleaned, []); assert.equal(result.blocked.length, 3);
    assert(result.blocked.every(item => item.code === 'PROCESS_IDENTITY_UNSUPPORTED'));
    for (const home of [active, orphan, other]) assert(await readFile(join(home, 'owner.json')));
    return;
  }
  assert.deepEqual(result.cleaned, [orphan]); assert(result.blocked.some(item => item.home === active && item.code === 'PROFILE_OWNER_ACTIVE'));
  assert.equal(result.resubmitted, false); await assert.rejects(readFile(join(orphan, 'owner.json')), { code: 'ENOENT' });
  assert(await readFile(join(other, 'owner.json'))); assert(await readFile(join(active, 'owner.json')));
});

test('selected-Provider expansion uses durable read-only execution and applies only an accepted exact-revision Draft', async t => {
  let proposal;
  const f = await fixture(t, { turn: async settings => {
    assert.equal(settings.toolBroker.tools().some(tool => tool.name === 'write_workspace'), false);
    const packet = await settings.toolBroker.call('read_workflow_resource', { path: 'analysis/request.txt' }, 'read-plan');
    assert(JSON.parse(packet.contentItems[0].text).text.includes(proposal.source_revision));
    const reference = await settings.toolBroker.call('read_workflow_resource', { path: 'source/reference.md' }, 'read-pinned-reference');
    assert.equal(JSON.parse(reference.contentItems[0].text).text, 'The marker is PINNED_BLUE, not this entire document.');
    return { output: JSON.stringify(proposal), thread_id: 'planning-thread', turn_id: 'planning-turn', audit: {} };
  } });
  const source = join(f.root, 'expansion-source'); await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), '---\nname: plan\ndescription: planning fixture\n---\nAnalyze the task and return a result.');
  await writeFile(join(source, 'reference.md'), 'The marker is PINNED_BLUE, not this entire document.');
  const { store } = await f.service.open(); const config = await f.service.config();
  const providers = config.providers.filter(item => item.enabled && item.kind === 'native_agent'); assert(providers.length >= 2);
  const pack = await importCoarseSkill(store, join(source, 'SKILL.md'), { id: 'source-draft', providerId: providers[0].id, role: providers[0].config.role });
  const origin = { confidence: 0.8, source_span: { resource: 'source/SKILL.md', start_line: 5, end_line: 5 } };
  proposal = { source_revision: pack.revision_hash, planning_analysis:{parallelism:'Single bounded task; no independent work.',main_responsibilities:'Main accepts; subagent checks.',human_intervention:'Final human confirmation only.'}, nodes: [{ id: 'analyze', type: 'agent', execution_target:'subagent',provider_choice:'native-luna',task_type: 'implementation', routing_reason: 'Routine bounded analysis', prompt_template: 'Analyze {{task}}', ...origin }],
    edges: [{ id: 'start-analyze', source: 'start', target: 'analyze', ...origin }, { id: 'analyze-final', source: 'analyze', target: 'final', ...origin }] };
  const planning = await f.service.call('create_expansion_run', { workflow_id: pack.workflow.id, revision_hash: pack.revision_hash, provider_id: providers[1].id,
    run_id: 'planning-job', workspace: f.workspace, main_actor: 'root' });
  const originalRules = await f.service.call('routing_defaults');
  const editedRules = structuredClone(originalRules); editedRules.routes.implementation.provider_id = providers[1].id;
  await f.service.call('save_routing_rules', {routing_rules:editedRules,expected_rules:originalRules}, {human:true});
  await assert.rejects(f.service.call('save_routing_rules', {routing_rules:originalRules,expected_rules:originalRules}, {human:true}), {code:'ROUTING_SETTINGS_CONFLICT'});
  await writeFile(join(source, 'reference.md'), 'Changed after the planning Run was pinned');
  const apply = { run_id: planning.run_id, control_token: planning.control_token, workflow_id: pack.workflow.id, expected_revision: pack.revision_hash };
  await assert.rejects(f.service.call('apply_expansion_result', apply), { code: 'EXPANSION_ACCEPTANCE_REQUIRED' });
  for (const node of ['expand', 'final']) {
    const lease = await f.service.call('claim_node', { run_id: planning.run_id, control_token: planning.control_token, node_id: node, owner: node === 'final' ? 'root' : 'planner', request_id: 'claim-' + node });
    if (node === 'expand') assert.equal(lease.provider.id, providers[1].id);
    const args = { run_id: planning.run_id, control_token: planning.control_token, node_id: node, attempt_id: lease.attempt_id, lease_token: lease.lease_token };
    await f.service.call('dispatch', args); await f.entry(args).job;
    if (node === 'final') await f.service.call('collect_strict', { ...args, accepted: true });
  }
  assert.equal(f.sessions.length, 2); assert.equal((await store.snapshot(pack.workflow.id)).revision_hash, pack.revision_hash);
  const expanded = await f.service.call('apply_expansion_result', apply);
  assert.equal(expanded.workflow.status, 'draft'); assert.equal(expanded.workflow.nodes.find(node => node.id === 'analyze').executor.provider_id, providers[0].id);
  assert(expanded.workflow.import_status.unresolved.some(item => item.code === 'AI_INFERENCES_REQUIRE_REVIEW'));
  await assert.rejects(f.service.call('apply_expansion_result', apply), { code: 'REVISION_CONFLICT' }); assert.equal(f.sessions.length, 2);
});

test('SkillRef nodes materialize only their Run-pinned source and references after the linked original disappears', async t => {
  let invoked;
  const f = await fixture(t, { turn: async settings => {
    invoked = settings; assert.equal(settings.allowedSkills.length, 1);
    assert.equal(settings.allowedSkills[0].files['reference.txt'].toString(), 'Pinned reference');
    const tools = settings.toolBroker.tools(); const resource = tools.find(tool => tool.name === 'read_workflow_resource').inputSchema.properties.path.enum.find(path => path.endsWith('/reference.txt'));
    assert.equal(JSON.parse((await settings.toolBroker.call('read_workflow_resource', { path: resource }, 'read-reference')).contentItems[0].text).text, 'Pinned reference');
    return { output: 'Skill complete', thread_id: 'skill-thread', turn_id: 'skill-turn', audit: {} };
  } });
  const source = join(f.root, 'linked-source'); await mkdir(source); const path = join(source, 'SKILL.md');
  const text = '---\nname: linked\ndescription: Linked fixture\n---\nRead [the reference](reference.txt) and apply the user task.';
  await writeFile(path, text); await writeFile(join(source, 'reference.txt'), 'Pinned reference');
  const pack = await f.service.call('read', { workflow_id: 'strict-test' }); const workflow = structuredClone(pack.workflow);
  const work = workflow.nodes.find(node => node.id === 'work'); work.type = 'skill_ref'; work.skill_ref = { path, name: 'linked', source_hash: digest(text), allowed_nested_skills: [] }; delete work.prompt_template;
  const saved = await f.service.call('save', { workflow_id: workflow.id, workflow, expected_revision: pack.revision_hash });
  const started = await f.service.call('start', { workflow_id: workflow.id, revision_hash: saved.revision_hash, workspace: f.workspace, main_actor: 'root', access: 'read_only', inputs: { task: 'Pinned Skill task' } });
  await rm(source, { recursive: true });
  const lease = await f.service.call('claim_node', { run_id: started.run_id, control_token: started.control_token, node_id: 'work', owner: 'worker', request_id: 'skill-claim' });
  const args = { run_id: started.run_id, control_token: started.control_token, node_id: 'work', attempt_id: lease.attempt_id, lease_token: lease.lease_token };
  await f.service.call('dispatch', args); await f.entry(args).job;
  assert.equal((await f.service.call('get', args)).nodes.work.status, 'succeeded'); assert.equal(invoked.allowedSkills[0].source_path, path);
  await assert.rejects(f.service.call('start', { workflow_id: workflow.id, workspace: f.workspace, main_actor: 'root', access: 'read_only' }), { code: 'ENOENT' });
});

test('Inline converts a linked node to an independently runnable Draft without changing its Provider or paths', async t => {
  const f = await fixture(t, { turn: async settings => {
    assert.deepEqual(settings.allowedSkills, []);
    const resource = await settings.toolBroker.call('read_workflow_resource', { path: 'inline/work/root/reference.txt' }, 'inlined-reference');
    assert.equal(JSON.parse(resource.contentItems[0].text).text, 'Independent reference');
    return { output: 'Inlined result', thread_id: 'inline-thread', turn_id: 'inline-turn', audit: {} };
  } });
  const source = join(f.root, 'inline-source'); await mkdir(source); const path = join(source, 'SKILL.md');
  const text = '---\nname: inline-me\ndescription: Inline fixture\n---\nRead [reference](reference.txt) and apply the task.';
  await writeFile(path, text); await writeFile(join(source, 'reference.txt'), 'Independent reference');
  const pack = await f.service.call('read', { workflow_id: 'strict-test' }); const workflow = structuredClone(pack.workflow); const work = workflow.nodes.find(node => node.id === 'work');
  work.type = 'skill_ref'; work.skill_ref = { path, name: 'inline-me', source_hash: digest(text), allowed_nested_skills: [] };
  const linked = await f.service.call('save', { workflow_id: workflow.id, workflow, expected_revision: pack.revision_hash });
  const inlined = await f.service.call('inline_skill', { workflow_id: workflow.id, node_id: 'work', expected_revision: linked.revision_hash });
  assert.equal(inlined.workflow.status, 'draft'); assert.equal(inlined.workflow.nodes.find(node => node.id === 'work').skill_ref, undefined);
  assert.deepEqual(inlined.workflow.nodes.find(node => node.id === 'work').executor, work.executor);
  await rm(source, { recursive: true });
  const review = await f.service.call('import_review', { workflow_id: workflow.id });
  const reviewed = await f.service.call('review_import', { workflow_id: workflow.id, expected_revision: inlined.revision_hash,
    decisions: review.issues.map(issue => ({ issue_id: issue.id, resolution: 'resolved', note: 'Verified the copied instruction and reference mapping' })) }, { human: true });
  await f.service.call('save', { workflow_id: workflow.id, workflow: { ...reviewed.workflow, status: 'ready' }, expected_revision: reviewed.revision_hash });
  const started = await f.service.call('start', { workflow_id: workflow.id, workspace: f.workspace, access: 'read_only', main_actor: 'root', inputs: { task: 'Run the inlined fixture' } });
  const lease = await f.service.call('claim_node', { run_id: started.run_id, control_token: started.control_token, node_id: 'work', owner: 'worker', request_id: 'inline-claim' });
  const args = { run_id: started.run_id, control_token: started.control_token, node_id: 'work', attempt_id: lease.attempt_id, lease_token: lease.lease_token };
  await f.service.call('dispatch', args); await f.entry(args).job; assert.equal((await f.service.call('get', args)).nodes.work.status, 'succeeded');
});
