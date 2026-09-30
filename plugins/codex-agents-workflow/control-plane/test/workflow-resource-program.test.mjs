import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from './physical-tempdir.mjs';
import { digest } from '../lib/workflow-revisions.mjs';
import { HostToolRunner, requireHostToolExecutionScope, validateHostToolContract } from '../lib/execution/host-tool-runner.mjs';
import { workflowResourceProgramIdentity, workflowResourceProgramRegistry } from '../lib/execution/workflow-resource-program.mjs';

test('a Host tool executes one pinned Workflow resource and observes its writes without a model turn', async t => {
  const workspace=await mkdtemp(join(tmpdir(),'workflow-resource-program-'));
  t.after(()=>rm(workspace,{recursive:true,maxRetries:3,retryDelay:100}));
  await mkdir(join(workspace,'work'));
  const path='workflow-assets/scripts/write.mjs';
  const bytes=Buffer.from('import { writeFileSync } from "node:fs"; writeFileSync("work/result.json", JSON.stringify({ok:true})); console.log(JSON.stringify({ok:true}));\n');
  const contract={id:'workflow-resource-program',identity:workflowResourceProgramIdentity(),argv:['node',path,'work/.workflow-runtime'],
    input_schema:{type:'object',additionalProperties:false},output_schema:{type:'object',required:['ok'],additionalProperties:false,properties:{ok:{type:'boolean'}}},
    env_allow:[],permissions:{network:false,read_paths:[path],write_paths:['work']},output_cap_bytes:4096,deadline_ms:30000,idempotency:{mode:'safe'}};
  const runner=new HostToolRunner({registry:workflowResourceProgramRegistry()});
  const executed=await runner.execute(contract,{}, {run_id:'run',node_id:'join',attempt_id:'attempt',workspace,
    permissions:{access:'bounded_write',allowed_paths:['work']},resources:[{path,sha256:digest(bytes),bytes}],
    runtime_environment:{status:'ready',tools:[{name:'node',path:process.execPath,status:'found'}]}});
  assert.equal(executed.receipt.status,'succeeded');
  assert.deepEqual(executed.output,{ok:true});
  assert.deepEqual(JSON.parse(await readFile(join(workspace,'work/result.json'),'utf8')),{ok:true});
  assert(executed.receipt.effects.changed_paths.includes('work/result.json'));
});

test('Host scratch uses the Run scope without widening the resource program business write contract', async t => {
  const workspace=await mkdtemp(join(tmpdir(),'workflow-resource-separated-scratch-'));
  t.after(()=>rm(workspace,{recursive:true,maxRetries:3,retryDelay:100}));
  await mkdir(join(workspace,'work/.workflow-prepared'),{recursive:true});
  const path='workflow-assets/scripts/write-prepared.mjs';
  const bytes=Buffer.from('import { writeFileSync } from "node:fs"; writeFileSync("work/.workflow-prepared/result.json", "{}"); console.log(JSON.stringify({ok:true}));\n');
  const contract={id:'separated-scratch',identity:workflowResourceProgramIdentity(),argv:['node',path,'work/.workflow-runtime'],
    input_schema:{type:'object',additionalProperties:false},output_schema:{type:'object',required:['ok'],additionalProperties:false,properties:{ok:{type:'boolean'}}},
    env_allow:[],permissions:{network:false,read_paths:[path],write_paths:['work/.workflow-prepared']},output_cap_bytes:4096,deadline_ms:30000,idempotency:{mode:'safe'}};
  const redundant={...contract,permissions:{...contract.permissions,write_paths:['work/.workflow-prepared','work/.workflow-runtime']}};
  assert.deepEqual(validateHostToolContract(redundant).permissions.write_paths,['work/.workflow-prepared']);
  const permissions={access:'bounded_write',allowed_paths:['work/.workflow-prepared','work/.workflow-runtime']};
  assert.deepEqual(requireHostToolExecutionScope(contract,permissions).write_paths,['work/.workflow-prepared','work/.workflow-runtime']);
  assert.throws(()=>requireHostToolExecutionScope(contract,{access:'bounded_write',allowed_paths:['work/.workflow-prepared']}),
    error=>error.code==='WORKFLOW_RESOURCE_SCOPE');
  const executed=await new HostToolRunner({registry:workflowResourceProgramRegistry()}).execute(contract,{},
    {run_id:'run',node_id:'join',attempt_id:'attempt',workspace,permissions,resources:[{path,sha256:digest(bytes),bytes}],
      runtime_environment:{status:'ready',tools:[{name:'node',path:process.execPath,status:'found'}]}});
  assert.equal(executed.receipt.status,'succeeded',executed.receipt.diagnostics.message);
  assert.deepEqual(executed.receipt.effects.changed_paths,['work/.workflow-prepared/result.json']);
});

test('the Host resource broker cannot report success for a write outside the node scope', async t => {
  const workspace=await mkdtemp(join(tmpdir(),'workflow-resource-scope-'));
  t.after(()=>rm(workspace,{recursive:true,maxRetries:3,retryDelay:100}));
  await mkdir(join(workspace,'work'));
  const path='workflow-assets/scripts/escape.mjs';
  const bytes=Buffer.from('import { writeFileSync } from "node:fs"; writeFileSync("outside.json", "{}"); console.log(JSON.stringify({ok:true}));\n');
  const contract={id:'workflow-resource-program',identity:workflowResourceProgramIdentity(),argv:['node',path,'work/.workflow-runtime'],
    input_schema:{type:'object',additionalProperties:false},output_schema:{type:'object',required:['ok'],additionalProperties:false,properties:{ok:{type:'boolean'}}},
    env_allow:[],permissions:{network:false,read_paths:[path],write_paths:['work']},output_cap_bytes:4096,deadline_ms:30000,idempotency:{mode:'safe'}};
  const runner=new HostToolRunner({registry:workflowResourceProgramRegistry()});
  const executed=await runner.execute(contract,{}, {run_id:'run',node_id:'join',attempt_id:'attempt',workspace,
    permissions:{access:'bounded_write',allowed_paths:['work']},resources:[{path,sha256:digest(bytes),bytes}],
    runtime_environment:{status:'ready',tools:[{name:'node',path:process.execPath,status:'found'}]}});
  assert.equal(executed.receipt.status,'failed');
  assert.deepEqual(executed.receipt.effects.outside_paths,['outside.json']);
});

test('a failing Workflow resource returns a failed Host receipt and removes its scratch script',async t=>{
  const workspace=await mkdtemp(join(tmpdir(),'workflow-resource-failure-'));
  t.after(()=>rm(workspace,{recursive:true,maxRetries:3,retryDelay:100}));
  await mkdir(join(workspace,'work'));
  const path='workflow-assets/scripts/fail.mjs';
  const bytes=Buffer.from('process.stderr.write("deliberate failure"); process.exitCode=7;\n');
  const contract={id:'workflow-resource-program',identity:workflowResourceProgramIdentity(),argv:['node',path,'work/.workflow-runtime'],
    input_schema:{type:'object',additionalProperties:false},output_schema:{type:'object',additionalProperties:false},
    env_allow:[],permissions:{network:false,read_paths:[path],write_paths:['work']},output_cap_bytes:4096,deadline_ms:30000,idempotency:{mode:'safe'}};
  const runner=new HostToolRunner({registry:workflowResourceProgramRegistry()});
  const executed=await runner.execute(contract,{}, {run_id:'run',node_id:'join',attempt_id:'attempt',workspace,
    permissions:{access:'bounded_write',allowed_paths:['work']},resources:[{path,sha256:digest(bytes),bytes}],
    runtime_environment:{status:'ready',tools:[{name:'node',path:process.execPath,status:'found'}]}});
  assert.equal(executed.receipt.status,'failed');
  assert.match(executed.receipt.diagnostics.message,/deliberate failure/);
  await assert.rejects(readFile(join(workspace,'work/.workflow-runtime',`${digest(bytes)}.mjs`)),{code:'ENOENT'});
});

test('Host passes projected structured input and a second pinned resource without model transcription',async t=>{
  const workspace=await mkdtemp(join(tmpdir(),'workflow-resource-input-'));
  t.after(()=>rm(workspace,{recursive:true,maxRetries:3,retryDelay:100}));
  await mkdir(join(workspace,'work'));
  const primary='workflow-assets/scripts/use-input.mjs',secondary='workflow-assets/scripts/reference.json';
  const script=Buffer.from('import { readFileSync } from "node:fs"; const input=JSON.parse(readFileSync(process.argv[2],"utf8")); const ref=JSON.parse(readFileSync(process.argv[3],"utf8")); console.log(JSON.stringify({count:input.jobs.length,version:ref.version}));\n');
  const reference=Buffer.from('{"version":3}\n');
  const contract={id:'structured-resource-job',identity:workflowResourceProgramIdentity(),
    argv:['node',primary,'work/.workflow-runtime','@INPUT@',`@RESOURCE:${secondary}@`],
    input_schema:{type:'object',properties:{jobs:{type:'array',items:{type:'integer'}}},required:['jobs'],additionalProperties:false},
    output_schema:{type:'object',properties:{count:{type:'integer'},version:{type:'integer'}},required:['count','version'],additionalProperties:false},
    env_allow:[],permissions:{network:false,read_paths:[primary,secondary],write_paths:['work']},output_cap_bytes:4096,
    deadline_ms:30000,idempotency:{mode:'safe'}};
  const runner=new HostToolRunner({registry:workflowResourceProgramRegistry()});
  const executed=await runner.execute(contract,{jobs:[1,2,3]}, {run_id:'run',node_id:'join',attempt_id:'attempt',workspace,
    permissions:{access:'bounded_write',allowed_paths:['work']},resources:[{path:primary,sha256:digest(script),bytes:script},
      {path:secondary,sha256:digest(reference),bytes:reference}],
    runtime_environment:{status:'ready',tools:[{name:'node',path:process.execPath,status:'found'}]}});
  assert.equal(executed.receipt.status,'succeeded',executed.receipt.diagnostics.message);
  assert.deepEqual(executed.output,{count:3,version:3});
  assert.deepEqual(executed.receipt.effects.changed_paths,[]);
});
