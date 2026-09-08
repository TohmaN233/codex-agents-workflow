import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from './physical-tempdir.mjs';
import { join } from 'node:path';
import { readSkillSnapshot, parseSkill, redactKnownCredentials } from '../lib/skill-import/skill-reader.mjs';
import { compileCoarseSkill, importCoarseSkill, verifyCoarseRelocation } from '../lib/skill-import/coarse-compiler.mjs';
import { WorkflowStore } from '../lib/workflow-store.mjs';
import { validateWorkflowGraph } from '../lib/workflow-validator.mjs';
import { digest, canonicalJSON } from '../lib/workflow-revisions.mjs';
import { SkillInventory } from '../lib/skill-import/inventory.mjs';
import { expansionPacket, applyExpansion, compileExpansion, EXPANSION_CONTRACT } from '../lib/skill-import/semantic-expander.mjs';
import { importReviewPacket, reviewImportedDraft } from '../lib/skill-import/review-import.mjs';
import { discoverCodexSkills } from '../lib/skill-import/codex-inventory.mjs';
import { discoverFolderSkills } from '../lib/skill-import/folder-inventory.mjs';
import { defaultRoutingRules } from '../lib/skill-import/routing-rules.mjs';
import { expansionRunPack } from '../lib/skill-import/expansion-run.mjs';
import { analyzeSkillDependencies } from '../lib/skill-import/dependency-reader.mjs';

test('dependency scanning distinguishes shell-local colors from external environment reads', () => {
  const snapshot={root:'/synthetic/source',metadata:{},problems:[],inventory:[],files:{
    'source/setup.sh':Buffer.from('N="reset"; G="green"\necho "${G}+${N} ${REMOTE_TOKEN}"'),
    'source/template.js':Buffer.from('const text = `${N}`; const key = process.env.API_KEY;'),
  }};
  assert.deepEqual(analyzeSkillDependencies(snapshot).requirements.environment,['API_KEY','REMOTE_TOKEN']);
});

test('code and binary assets relocate byte-for-byte and are not definition errors', async t => {
  const f=await fixture(t,'Use the bundled script and binary asset at execution time.');
  await mkdir(join(f.sourceRoot,'scripts'));
  const code=Buffer.from('print("portable")\n'); const binary=Buffer.from([0,255,128,1]);
  await writeFile(join(f.sourceRoot,'scripts','run.py'),code);await writeFile(join(f.sourceRoot,'asset.bin'),binary);
  await writeFile(join(f.sourceRoot,'.env.example'),'API_KEY=\n');
  const pack=await importCoarseSkill(f.store,f.source,{id:'portable'});
  await rm(f.sourceRoot,{recursive:true});
  const files=await f.store.resources('portable');
  assert.deepEqual(files['source/scripts/run.py'],code);assert.deepEqual(files['source/asset.bin'],binary);
  assert.equal(files['source/.env.example'].toString(),'API_KEY=\n');
  const definition=validateWorkflowGraph({...pack.workflow,status:'ready'},{tools:['read_workflow_resource']});
  assert.equal(definition.launch_ready,true);
  assert(pack.workflow.requirements.executables.includes('python'));
  assert(pack.import_report.observations.some(i=>i.code==='SCRIPT_REQUIRES_REVIEW'));
});

test('automatic planning pins model suitability and compiles main, independent parallel agents and human approval', async t => {
  const f=await fixture(t,'Inspect two independent sources, synthesize, ask approval.');
  const providers=[{id:'custom-fast',description:'Fast bounded evidence extraction',enabled:true,kind:'native_agent',capabilities:{read:true},config:{model:'custom-model',role:'implementer'}}];
  const pack=await importCoarseSkill(f.store,f.source,{id:'automatic'});
  const resources=await f.store.resources('automatic'); const rules=defaultRoutingRules(providers);
  const span={resource:'source/SKILL.md',start_line:9,end_line:9};
  const proposal={source_revision:pack.revision_hash,planning_analysis:{parallelism:'A and B read independent sources, join before synthesis.',main_responsibilities:'Main synthesizes evidence.',human_intervention:'Confirm synthesis before final acceptance.'},nodes:[
    {id:'fork',type:'parallel',join_id:'join'},
    ...['a','b'].map(id=>({id,type:'agent',execution_target:'subagent',provider_choice:'custom-fast',task_type:'implementation',routing_reason:'Fast bounded evidence extraction fits the independent read task',prompt_template:'Read evidence'})),
    {id:'join',type:'join',parallel_id:'fork'},
    {id:'synthesize',type:'agent',execution_target:'main',task_type:'planning',routing_reason:'Main retains cross-source synthesis and user decisions',prompt_template:'Synthesize'},
    {id:'confirm',type:'human_gate',prompt_template:'Confirm synthesis'},
  ].map(n=>({...n,confidence:0.9,source_span:span})),edges:[['start','fork'],['fork','a'],['fork','b'],['a','join'],['b','join'],['join','synthesize'],['synthesize','confirm'],['confirm','final']].map(([source,target])=>({id:source+'-'+target,source,target,...(source==='fork'?{label:target}:{}),confidence:0.9,source_span:span}))};
  const context={providers,routing_rules:rules,tools:['read_workflow_resource']};
  assert.match(expansionPacket(pack,resources,providers[0],rules,providers).prompt,/Fast bounded evidence extraction/);
  const result=compileExpansion(pack,resources,proposal,context);
  assert.equal(result.validation.valid,true);
  const invalidChoice=structuredClone(proposal);invalidChoice.nodes.find(n=>n.id==='a').provider_choice='invented';
  assert.throws(()=>compileExpansion(pack,resources,invalidChoice,context),{code:'ROUTING_CLASSIFICATION'});
  assert.equal(result.workflow.nodes.find(n=>n.id==='synthesize').executor.kind,'main');
  assert.equal(result.workflow.nodes.find(n=>n.id==='a').executor.provider_id,'custom-fast');
  assert.equal(result.workflow.nodes.find(n=>n.id==='confirm').approval.required,true);
  assert.throws(()=>compileExpansion(pack,resources,{...proposal,planning_analysis:undefined},context),{code:'EXPANSION_PLANNING_ANALYSIS'});
  assert.throws(()=>compileExpansion(pack,resources,proposal,{...context,providers:[],routing_catalog:providers}),{code:'ROUTING_PROVIDER_UNAVAILABLE'});
  const saved=await applyExpansion(f.store,'automatic',proposal,{expected_revision:pack.revision_hash,context,inference_confirmation:'Confirmed all displayed nodes and edges'});
  assert(!validateWorkflowGraph(saved.workflow,context).blockers.some(i=>i.code==='AI_INFERENCE_UNREVIEWED'));
  assert(saved.workflow.nodes.find(n=>n.id==='a').origin.review.note);
  assert.equal(saved.workflow.status,'draft');
  assert.deepEqual(saved.workflow.requirements.executables,pack.workflow.requirements.executables);
});

test('folder discovery scans default Codex roots without a binary and reselects custom folders by source hash', async t => {
  const f = await fixture(t);
  const home = join(f.root,'codex');
  await mkdir(join(home,'skills','demo'),{recursive:true});
  await mkdir(join(home,'plugins','cache'),{recursive:true});
  await writeFile(join(home,'skills','demo','SKILL.md'),await readFile(f.source));
  const inventory = new SkillInventory(folder=>discoverFolderSkills(folder,{env:{CODEX_HOME:home}}));
  const found = await inventory.list();
  assert.equal(found.entries.length,1); assert.equal(found.complete,true);
  assert.equal(found.model_invocations,0); assert.equal(found.entries[0].enabled,false);
  const custom = await inventory.list(f.sourceRoot);
  assert.equal(custom.entries.length,1);
  await writeFile(f.source,(await readFile(f.source,'utf8'))+'\nChanged');
  await assert.rejects(inventory.select(f.sourceRoot,custom.entries[0].id),{code:'SKILL_SELECTION_STALE'});
  const absent = await inventory.list(join(f.root,'absent'));
  assert.equal(absent.complete,false); assert.equal(absent.errors[0].code,'ENOENT');
  await assert.rejects(inventory.list('relative'),{code:'SKILL_DISCOVERY_FOLDER'});
});

test('routed expansion assigns each responsibility independently and pins editable planning rules', async t => {
  const f = await fixture(t,'Implement a result.\nReview the result.');
  const providers = [
    {id:'native-luna',enabled:true,kind:'native_agent',capabilities:{read:true,write:true},config:{role:'implementer'}},
    {id:'native-terra',enabled:true,kind:'native_agent',capabilities:{read:true,write:true},config:{role:'implementer'}},
    {id:'native-reviewer',enabled:true,kind:'native_agent',capabilities:{read:true,write:false},config:{role:'reviewer'}},
  ];
  const pack = await importCoarseSkill(f.store,f.source,{id:'routed'});
  const resources = await f.store.resources('routed');
  const rules = {...defaultRoutingRules(providers),selection_mode:"fixed"};
  const span = {resource:'source/SKILL.md',start_line:10,end_line:10};
  const proposal = {source_revision:pack.revision_hash,nodes:[
    {id:'build',type:'agent',task_type:'implementation',routing_reason:'Routine production',prompt_template:'Implement',confidence:0.9,source_span:span},
    {id:'check',type:'agent',task_type:'review',routing_reason:'Independent checking',prompt_template:'Review',confidence:0.9,source_span:span},
  ],edges:[['start','build'],['build','check'],['check','final']].map(([source,target])=>({id:source+'-'+target,source,target,confidence:0.9,source_span:span}))};
  const packet = expansionPacket(pack,resources,providers[1],rules);
  assert.deepEqual(packet.routing_rules,rules);
  assert.throws(()=>compileExpansion(pack,resources,proposal,{providers}),{code:'ROUTING_RULES_REQUIRED'});
  const result = compileExpansion(pack,resources,proposal,{providers,routing_rules:packet.routing_rules,tools:['read_workflow_resource']});
  const boundPack = structuredClone(pack); boundPack.workflow.nodes.find(n=>n.id==='instructions').executor={kind:'provider',provider_id:'native-luna'};
  assert.throws(()=>compileExpansion(boundPack,resources,proposal,{providers}),{code:'ROUTING_RULES_REQUIRED'});
  const bound = compileExpansion(boundPack,resources,proposal,{providers,routing_rules:packet.routing_rules,tools:['read_workflow_resource']});
  assert.equal(bound.workflow.nodes.find(n=>n.id==='check').executor.provider_id,'native-reviewer');
  assert.equal(result.workflow.nodes.find(n=>n.id==='build').executor.provider_id,'native-luna');
  assert.equal(result.workflow.nodes.find(n=>n.id==='check').executor.provider_id,'native-reviewer');
  assert.equal(result.workflow.nodes.find(n=>n.id==='final').executor.kind,'main');
  assert.equal(result.workflow.status,'draft');
  const job = expansionRunPack(pack,resources,providers[1],'planning-job',rules);
  rules.routes.implementation.provider_id='native-terra';
  assert.equal(job.provenance.routing_rules.routes.implementation.provider_id,'native-luna');
  assert.match(job.resources['analysis/request.txt'],/task_type/);
  const disabled = providers.map(p=>p.id==='native-reviewer'?{...p,enabled:false}:p);
  assert.throws(()=>compileExpansion(pack,resources,proposal,{providers:disabled,routing_rules:rules}),{code:'ROUTING_PROVIDER_UNAVAILABLE'});
  const invalid = structuredClone(proposal); invalid.nodes[0].task_type='invented';
  assert.throws(()=>compileExpansion(pack,resources,invalid,{providers,routing_rules:rules}),{code:'ROUTING_CLASSIFICATION'});
  const forged = structuredClone(proposal); forged.nodes[0].executor={kind:'main'};
  assert.throws(()=>compileExpansion(pack,resources,forged,{providers,routing_rules:rules}),{code:'EXPANSION_AUTHORITY'});
});

async function fixture(t, body = 'Read [the guide](references/guide.md) and return a result.') {
  const root = await mkdtemp(join(tmpdir(), 'skill-import-')); t.after(() => rm(root, { recursive: true, maxRetries: 3, retryDelay: 100 }));
  const sourceRoot = join(root, 'original'); await mkdir(join(sourceRoot, 'references'), { recursive: true });
  const source = join(sourceRoot, 'SKILL.md');
  await writeFile(source, '---\nname: "Example: quoted name"\ndescription: >-\n  A folded description\n  across two lines.\nlicense: ISC\n---\n\n' + body);
  await writeFile(join(sourceRoot, 'references', 'guide.md'), 'A self-contained reference.');
  const store = await new WorkflowStore(join(root, 'packs')).initialize(); return { root, sourceRoot, source, store };
}

test('real YAML parsing preserves quoted and folded metadata and rejects duplicate keys and unsafe aliases', () => {
  assert.equal(parseSkill('---\nname: "A: B"\ndescription: >-\n  First\n  second\n---\nDo work.').metadata.description, 'First second');
  assert.throws(() => parseSkill('---\nname: a\nname: b\ndescription: test\n---\nDo work.'), { code: 'SKILL_YAML' });
  assert.throws(() => parseSkill('---\nname: a\ndescription: !unsafe test\n---\nDo work.'), { code: 'SKILL_YAML' });
});

test('coarse import is deterministic, preserves both metadata formats and survives source removal', async t => {
  const f = await fixture(t); const original = await readFile(f.source);
  await mkdir(join(f.sourceRoot, 'agents')); await writeFile(join(f.sourceRoot, 'agents', 'openai.yaml'), 'interface:\n  display_name: Example\n');
  await writeFile(join(f.sourceRoot, 'SKILL.json'), '{"name":"Example"}');
  const source = await readSkillSnapshot(f.source, { expectedSourceHash: digest(original) });
  const one = compileCoarseSkill(source, { id: 'imported', providerId: 'chosen' });
  const two = compileCoarseSkill(source, { id: 'imported', providerId: 'chosen' });
  assert.equal(canonicalJSON(one.workflow), canonicalJSON(two.workflow)); assert.equal(one.workflow.status, 'draft');
  const main = compileCoarseSkill(source, { id: 'main-import' }); assert.deepEqual(main.workflow.nodes[1].executor, { kind: 'main' });
  assert.deepEqual(main.workflow.requirements.providers, []); assert.equal(main.workflow.skill_policy.mode, 'strict');
  assert.deepEqual(one.workflow.nodes.map(node => node.type), ['start', 'agent', 'agent', 'end']);
  assert.equal(one.workflow.nodes[1].executor.provider_id, 'chosen'); assert.deepEqual(Object.keys(one.provenance.metadata_files).sort(), ['SKILL.json', 'agents/openai.yaml']);
  const pack = await f.store.create(one.workflow, one); assert.deepEqual(await readFile(f.source), original);
  await rm(f.sourceRoot, { recursive: true });
  const resources = await f.store.resources('imported'); const evidence = verifyCoarseRelocation(pack, resources);
  assert.equal(evidence.source_independent, true); assert.equal(evidence.original_source_read, false); assert.equal(evidence.files_verified, 4);
  assert.equal(resources['source/SKILL.md'].toString(), original.toString());
});

test('scripts, missing references, external paths and credential resources stay observable and blocked', async t => {
  const f = await fixture(t, 'Read [missing](../outside.txt). Use C:\\private\\source.');
  await mkdir(join(f.sourceRoot, 'scripts')); await writeFile(join(f.sourceRoot, 'scripts', 'run.mjs'), 'throw new Error("IMPORT_MUST_NEVER_EXECUTE_THIS");\nconst key = process.env.REQUIRED_KEY;');
  await writeFile(join(f.sourceRoot, '.env'), 'SYNTHETIC_SECRET_VALUE=must-not-be-copied');
  const pack = await importCoarseSkill(f.store, f.source, { id: 'requirements', providerId: 'chosen' });
  assert.equal(pack.import_report.scripts_executed, 0);
  assert(pack.import_report.observations.some(item => item.code === 'SCRIPT_REQUIRES_REVIEW'));
  assert(pack.workflow.import_status.unresolved.some(item => item.code === 'UNRESOLVED_LOCAL_REFERENCE'));
  assert(pack.workflow.import_status.unresolved.some(item => item.code === 'CREDENTIAL_FILE_EXCLUDED'));
  const resources = await f.store.resources('requirements'); assert.equal(resources['source/.env'], undefined);
  assert.deepEqual(pack.workflow.requirements.environment, ['REQUIRED_KEY']);
  const validation = validateWorkflowGraph({ ...pack.workflow, status: 'ready' }, { providers: [{ id: 'chosen', enabled: true, capabilities: { read: true } }], tools: ['read_workflow_resource'], executables: ['node'] });
  assert(validation.blockers.some(item => item.code === 'IMPORT_UNRESOLVED'));
  assert(!validation.blockers.some(item => item.requirement === 'REQUIRED_KEY'));
  assert(validateWorkflowGraph({...pack.workflow,status:'ready'},{providers:[{id:'chosen',enabled:true,capabilities:{read:true}}],check_runtime_requirements:true}).blockers.some(item=>item.requirement==='REQUIRED_KEY'));
  assert.throws(() => verifyCoarseRelocation(pack, resources), { code: 'IMPORT_UNRESOLVED' });
});

test('declared metadata dependencies become requirements without activating commands, connections or Provider bindings', async t => {
  const f = await fixture(t); await mkdir(join(f.sourceRoot, 'agents'));
  await writeFile(join(f.sourceRoot, 'agents', 'openai.yaml'), 'dependencies:\n  tools:\n    - type: mcp\n      value: github\n      transport: streamable_http\n      url: https://example.invalid/mcp\n');
  await writeFile(join(f.sourceRoot, 'SKILL.json'), JSON.stringify({ name: 'Example', requirements: { executables: ['git'], environment: ['REQUIRED_NAME'], providers: ['never-bind-this'] } }));
  const pack = await importCoarseSkill(f.store, f.source, { id: 'declared', providerId: 'chosen' });
  assert.deepEqual(pack.workflow.requirements.mcp_servers, ['github']); assert.deepEqual(pack.workflow.requirements.executables, ['git']);
  assert.deepEqual(pack.workflow.requirements.environment, ['REQUIRED_NAME']); assert.deepEqual(pack.workflow.requirements.providers, ['chosen']);
  assert(pack.workflow.import_status.unresolved.some(item => item.code === 'MCP_CONNECTION_REQUIRES_REVIEW'));
  assert(pack.workflow.import_status.unresolved.some(item => item.code === 'UNSUPPORTED_DECLARED_REQUIREMENT'));
  assert.equal(pack.import_report.scripts_executed, 0); assert.equal(pack.workflow.import_status.classification, 'external_requirements');
});

test('invalid optional metadata remains a visible Draft blocker and does not silently lose declared dependencies', async t => {
  const f = await fixture(t); await mkdir(join(f.sourceRoot, 'agents'));
  await writeFile(join(f.sourceRoot, 'agents', 'openai.yaml'), 'dependencies:\n  tools: []\ndependencies: {}\n');
  await writeFile(join(f.sourceRoot, 'SKILL.json'), '{"requirements": {"environment": {"TOKEN": "${FROM_ENV}"}}}');
  const pack = await importCoarseSkill(f.store, f.source, { id: 'invalid-metadata' });
  assert.equal(pack.workflow.status, 'draft');
  assert.equal(pack.workflow.import_status.unresolved.filter(item => item.code === 'INVALID_DEPENDENCY_METADATA').length, 2);
  assert.throws(() => verifyCoarseRelocation(pack, {}), { code: 'IMPORT_UNRESOLVED' });
});

test('known secret values are redacted with explicit Draft blockers; source bytes stay unchanged', async t => {
  const secret = 'sk-proj-' + 'x'.repeat(40); const f = await fixture(t, 'Use token ' + secret + ' in an example.');
  await writeFile(join(f.sourceRoot, 'settings.json'), '{"password":"synthetic-sensitive-value"}');
  const sourceBytes = await readFile(f.source); const pack = await importCoarseSkill(f.store, f.source, { id: 'redacted' });
  const resources = await f.store.resources('redacted');
  assert(!resources['source/SKILL.md'].toString().includes(secret));
  assert(!resources['source/settings.json'].toString().includes('synthetic-sensitive-value'));
  assert(pack.workflow.import_status.unresolved.some(item => item.code === 'CREDENTIAL_REDACTED'));
  assert.equal(pack.provenance.source_hash, digest(sourceBytes)); assert.deepEqual(await readFile(f.source), sourceBytes);
});

test('credential scanning preserves executable references, type annotations and shell templates byte-for-byte', async t => {
  const f = await fixture(t);
  const code = 'def transcribe(api_key: str):\n    api_key = load_api_key()\n    return request(headers={"xi-api-key": api_key}, api_key=api_key)\n';
  const docs = '```bash\nprintf \'ELEVENLABS_API_KEY=%s\\n\' "$KEY"\ngrep -q \'^ELEVENLABS_API_KEY=..\' .env\n```\n`ELEVENLABS_API_KEY=...`\n';
  await writeFile(join(f.sourceRoot, 'transcribe.py'), code);
  await writeFile(join(f.sourceRoot, 'install.md'), docs);
  const snapshot = await readSkillSnapshot(f.source);
  assert.equal(snapshot.files['source/transcribe.py'].toString(), code);
  assert.equal(snapshot.files['source/install.md'].toString(), docs);
  assert(!snapshot.problems.some(item => item.code === 'CREDENTIAL_REDACTED'));
});

test('literal credentials remain blocked in source, configuration and documentation', () => {
  for (const [sourcePath, source] of [
    ['app.py', 'api_key: str = "synthetic-sensitive-value"'],
    ['app.js', 'const password = "synthetic-sensitive-value";'],
    ['config.yaml', 'password: synthetic-sensitive-value'],
    ['install.md', '```bash\nexport API_KEY=synthetic-sensitive-value\n```'],
  ]) {
    const result = redactKnownCredentials(source, { sourcePath });
    assert(!result.text.includes('synthetic-sensitive-value'), sourcePath);
    assert.equal(result.findings.length, 1, sourcePath);
  }
});

test('linked resources are excluded with evidence and stale selected source is rejected', async t => {
  const f = await fixture(t); await mkdir(join(f.root, 'outside')); await symlink(join(f.root, 'outside'), join(f.sourceRoot, 'linked'), 'junction');
  const snapshot = await readSkillSnapshot(f.source); assert(snapshot.problems.some(item => item.code === 'LINK_OR_SPECIAL_RESOURCE'));
  await assert.rejects(readSkillSnapshot(f.source, { expectedSourceHash: 'a'.repeat(64) }), { code: 'SKILL_SOURCE_CHANGED' });
});

test('host inventory exposes per-path read errors and stale selections cannot import changed bytes', async t => {
  const f = await fixture(t);
  const inventory = new SkillInventory(async () => ({ skills: [{ path: f.source, scope: 'user', enabled: true }, { path: join(f.sourceRoot, 'missing', 'SKILL.md'), scope: 'user', enabled: true }], errors: [] }));
  const listed = await inventory.list(f.root); assert.equal(listed.complete, false); assert.equal(listed.entries.length, 1); assert.equal(listed.errors.length, 1);
  assert.equal((await inventory.select(f.root, listed.entries[0].id)).source_hash, digest(await readFile(f.source)));
  await writeFile(f.source, (await readFile(f.source, 'utf8')) + '\nChanged');
  await assert.rejects(inventory.select(f.root, listed.entries[0].id), { code: 'SKILL_SELECTION_STALE' });
});

test('configured-profile inventory uses only actual metadata RPCs, keeps path errors and closes without model or config operations', async t => {
  const f = await fixture(t); const calls = []; let closed = false;
  const home = join(f.root, 'codex-profile'); await mkdir(home); await writeFile(join(home, 'config.toml'), 'model = "synthetic"\n');
  const result = await discoverCodexSkills(f.root, { config: {}, env: { CODEX_HOME: home }, qualify: async () => {},
    clientFactory: (_binary, settings) => {
      assert.equal(settings.home, home); return { initialized() { calls.push('initialized'); }, async close() { closed = true; },
        async call(method, params) { calls.push(method); if (method === 'initialize') return {};
          assert.equal(method, 'skills/list'); assert.deepEqual(params, { cwds: [f.root], forceReload: true });
          return { data: [{ cwd: f.root, skills: [{ path: f.source, scope: 'user', enabled: true }], errors: [{ path: 'unreadable-skill', message: 'Do not echo raw host diagnostics' }] }] };
        } };
    } });
  assert.deepEqual(calls, ['initialize', 'initialized', 'skills/list']); assert.equal(closed, true); assert.equal(result.model_invocations, 0);
  assert.deepEqual(result.errors, [{ code: 'CODEX_SKILL_DISCOVERY_ERROR', path: 'unreadable-skill' }]);
  const inventory = await new SkillInventory(async () => result).list(f.root); assert.equal(inventory.complete, false); assert.equal(inventory.entries.length, 1);
});

test('inventory detects concurrent host config edits without reverting them', async t => {
  const f = await fixture(t); const home = join(f.root, 'codex-profile'); await mkdir(home); const path = join(home, 'config.toml'); await writeFile(path, 'before');
  await assert.rejects(discoverCodexSkills(f.root, { config: {}, env: { CODEX_HOME: home }, qualify: async () => {},
    clientFactory: () => ({ initialized() {}, async close() {}, async call(method) {
      if (method === 'initialize') return {};
      await writeFile(path, 'concurrent user edit'); return { data: [{ cwd: f.root, skills: [], errors: [] }] };
    } }) }), { code: 'SKILL_DISCOVERY_CONFIG_CHANGED' });
  assert.equal(await readFile(path, 'utf8'), 'concurrent user edit');
});

test('AI expansion stays Draft, pins inferences, preserves authority and retains the coarse revision on failure', async t => {
  const f = await fixture(t); const provider = { id: 'chosen', enabled: true, capabilities: { read: true } };
  const pack = await importCoarseSkill(f.store, f.source, { id: 'expanded', providerId: provider.id }); const resources = await f.store.resources('expanded');
  const packet = expansionPacket(pack, resources, provider); assert.equal(packet.access, 'read_only'); assert.equal(packet.source_revision, pack.revision_hash);
  assert.match(packet.prompt, /planning Run task is not the future task/);
  assert.match(packet.prompt, /standalone tool nodes are unsupported/);
  assert.match(packet.prompt, /Existing input schema and coarse instructions/);
  assert.throws(() => expansionPacket(pack, resources, { ...provider, enabled: false }), { code: 'EXPANSION_PROVIDER' });
  const inference = { confidence: 0.7, source_span: { resource: 'source/SKILL.md', start_line: 9, end_line: 9 } };
  const proposal = { source_revision: pack.revision_hash, nodes: [{ id: 'step', type: 'agent', prompt_template: 'Apply the pinned guide to {{task}}', ...inference }],
    edges: [{ id: 'start-step', source: 'start', target: 'step', ...inference }, { id: 'step-final', source: 'step', target: 'final', ...inference }] };
  const invalid = structuredClone(proposal); invalid.nodes[0].access = 'bounded_write';
  await assert.rejects(applyExpansion(f.store, 'expanded', invalid, { expected_revision: pack.revision_hash, context: { providers: [provider] } }), { code: 'EXPANSION_AUTHORITY' });
  assert.equal((await f.store.snapshot('expanded')).revision_hash, pack.revision_hash);
  const next = await applyExpansion(f.store, 'expanded', proposal, { expected_revision: pack.revision_hash, context: { providers: [provider] } });
  assert.equal(next.workflow.status, 'draft'); assert.equal(next.workflow.nodes.find(node => node.id === 'step').access, 'read_only');
  assert.equal(next.workflow.nodes.find(node => node.id === 'step').executor.provider_id, provider.id);
  assert.equal(next.workflow.nodes.find(node => node.id === 'final').executor.kind, 'main');
  assert(next.workflow.import_status.unresolved.some(item => item.code === 'AI_INFERENCES_REQUIRE_REVIEW'));
  assert.equal((await f.store.snapshot('expanded', pack.revision_hash)).workflow.import_status.mode, 'coarse');
  const stale = structuredClone(proposal); stale.source_revision = 'a'.repeat(64);
  await assert.rejects(applyExpansion(f.store, 'expanded', stale, { expected_revision: next.revision_hash, context: { providers: [provider] } }), { code: 'EXPANSION_SCHEMA' });
  const review = importReviewPacket(next); assert.equal(review.inferences.length, 3);
  await assert.rejects(reviewImportedDraft(f.store, 'expanded', { expected_revision: next.revision_hash, decisions: [{ issue_id: review.issues.find(issue => issue.code === 'AI_INFERENCES_REQUIRE_REVIEW').id, resolution: 'resolved', note: 'Cannot blanket-approve inferred flow' }] }), { code: 'IMPORT_REVIEW_ISSUE' });
  const reviewed = await reviewImportedDraft(f.store, 'expanded', { expected_revision: next.revision_hash,
    inferences: review.inferences.map(item => ({ kind: item.kind, id: item.id, note: 'Checked this item against its pinned source span' })) });
  assert.equal(reviewed.workflow.status, 'draft'); assert.equal(reviewed.workflow.import_status.unresolved.length, 0);
  assert.equal(reviewed.workflow.nodes.find(node => node.id === 'step').executor.provider_id, provider.id);
  assert(reviewed.import_report.review_history[0].decisions.length === 3);
  const forged = structuredClone(next.workflow); forged.import_status.unresolved = []; forged.status = 'ready';
  assert(validateWorkflowGraph(forged, { providers: [provider] }).blockers.some(item => item.code === 'AI_INFERENCE_UNREVIEWED'));
});

test('published expansion contract compiles a named gate and finite condition without granting model authority', async t => {
  const f = await fixture(t); const provider = { id: 'chosen', enabled: true, capabilities: { read: true } };
  const pack = await importCoarseSkill(f.store, f.source, { id: 'contract', providerId: provider.id });
  const resources = await f.store.resources('contract');
  const origin = { confidence: 0.9, source_span: { resource: 'source/SKILL.md', start_line: 9, end_line: 9 } };
  const proposal = { source_revision: pack.revision_hash, nodes: [
    { id: 'confirm', name: 'Confirm strategy', type: 'human_gate', prompt_template: 'Wait for explicit confirmation.', ...origin },
    { id: 'route', type: 'condition', ...structuredClone(EXPANSION_CONTRACT.condition_example), ...origin },
    ...['yes', 'no'].map(id => ({ id, name: id, type: 'agent', prompt_template: 'Report the actual result.', outputs_schema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] }, ...origin }))
  ], edges: [
    { id: 'a', source: 'start', target: 'confirm' }, { id: 'b', source: 'confirm', target: 'route' },
    { id: 'c', source: 'route', target: 'yes', label: 'yes' }, { id: 'd', source: 'route', target: 'no', label: 'no' },
    { id: 'e', source: 'yes', target: 'final' }, { id: 'f', source: 'no', target: 'final' }
  ].map(edge => ({ ...edge, ...origin })) };
  const compiled = compileExpansion(pack, resources, proposal, { providers: [provider] });
  const unsupportedTool = structuredClone(proposal);
  unsupportedTool.nodes[2] = { id: 'yes', type: 'tool', tool: 'read_workflow_resource', ...origin };
  assert.throws(() => compileExpansion(pack, resources, unsupportedTool, { providers: [provider] }), { code: 'EXPANSION_STRICT_TOOL_UNSUPPORTED' });
  const gate = compiled.workflow.nodes.find(node => node.id === 'confirm');
  assert.equal(gate.name, 'Confirm strategy'); assert.equal(gate.executor.kind, 'human'); assert.equal(gate.approval.required, true);
  assert.deepEqual(compiled.workflow.nodes.find(node => node.id === 'yes').outputs_schema, proposal.nodes[2].outputs_schema);
  const invalid = structuredClone(proposal); invalid.nodes[1].condition_dsl = 'choice == true';
  assert.throws(() => compileExpansion(pack, resources, invalid, { providers: [provider] }), { code: 'EXPANSION_AUTHORITY' });
  const cyclic = structuredClone(proposal); cyclic.edges.find(edge => edge.id === 'e').target = 'confirm';
  assert.throws(() => compileExpansion(pack, resources, cyclic, { providers: [provider] }), { code: 'EXPANSION_GRAPH_INVALID' });
  const inventedGate = structuredClone(proposal);
  inventedGate.nodes[0].outputs_schema = { type: 'object', properties: { strategy_approved: { type: 'boolean' } }, required: ['strategy_approved'] };
  assert.throws(() => compileExpansion(pack, resources, inventedGate, { providers: [provider] }), { code: 'EXPANSION_GRAPH_INVALID' });
  delete inventedGate.nodes[0].outputs_schema;
  inventedGate.nodes[1].cases[0].when = { op: 'eq', args: [{ path: '/nodes/confirm/output/strategy_approved' }, { value: true }] };
  assert.throws(() => compileExpansion(pack, resources, inventedGate, { providers: [provider] }), { code: 'EXPANSION_GRAPH_INVALID' });
  inventedGate.nodes[1].cases[0].when.args[0].path = '/nodes/confirm/output/approved';
  assert.equal(compileExpansion(pack, resources, inventedGate, { providers: [provider] }).validation.valid, true);
  assert.equal((await f.store.snapshot('contract')).revision_hash, pack.revision_hash);
});

test('import issue review retains exact evidence and requirements under CAS without publishing', async t => {
  const f = await fixture(t, 'Read [missing](references/missing.md).');
  const pack = await importCoarseSkill(f.store, f.source, { id: 'reviewed', providerId: 'chosen' });
  const review = importReviewPacket(pack); const issue = review.issues.find(item => item.code === 'UNRESOLVED_LOCAL_REFERENCE'); assert(issue);
  const args = { expected_revision: pack.revision_hash, decisions: [{ issue_id: issue.id, resolution: 'not_required', note: 'Citation is contextual; source instructions are complete locally' }] };
  const next = await reviewImportedDraft(f.store, 'reviewed', args);
  assert.equal(next.workflow.status, 'draft'); assert.deepEqual(next.workflow.requirements, pack.workflow.requirements);
  assert.equal(next.import_report.review_history[0].source_revision, pack.revision_hash);
  assert.equal(next.import_report.review_history[0].decisions[0].observation.target, 'references/missing.md');
  assert.equal(next.workflow.import_status.unresolved.length, 0);
  await assert.rejects(reviewImportedDraft(f.store, 'reviewed', args), { code: 'REVISION_CONFLICT' });
});
