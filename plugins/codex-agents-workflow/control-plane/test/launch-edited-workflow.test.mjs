import test from 'node:test';
import assert from 'node:assert/strict';
import {launchEditedWorkflow} from '../web-src/launch-edited-workflow.mjs';
const pack=(revision,status='draft')=>({workflow:{id:'example',status,enabled:true},revision_hash:revision});
test('edited launch saves, validates and starts exactly the returned revision',async()=>{
  const calls=[];
  const result=await launchEditedWorkflow({pack:pack('old','ready'),dirty:true,
    save:async()=>{calls.push('save');return pack('saved');},
    request:async(op,args)=>{calls.push(op);if(op==='publish'){assert.equal(args.expected_revision,'saved');assert.equal(args.reviewed,true);return pack('ready','ready');}assert.equal(args.revision_hash,'ready');assert.equal(args.workspace,'workspace');return {run_id:'run'};},
    onSaved:async p=>{assert.equal(p.revision_hash,'ready');calls.push('shown');},options:{workspace:'workspace',revision_hash:'must-not-override'}});
  assert.deepEqual(calls,['save','publish','shown','start']);assert.equal(result.run_id,'run');
});
test('failed validation or concurrent revision conflict prevents launch',async()=>{
  const calls=[];await assert.rejects(launchEditedWorkflow({pack:pack('draft'),dirty:false,save:async()=>assert.fail('no edit'),request:async op=>{calls.push(op);throw new Error('revision conflict');},onSaved:async()=>assert.fail('not published'),options:{}}),/revision conflict/);
  assert.deepEqual(calls,['publish']);
});
test('unchanged ready launch preserves its existing version and disabled flows cannot launch',async()=>{
  let operations=[];const args={pack:pack('same','ready'),dirty:false,save:async()=>assert.fail('no edit'),request:async(op,value)=>{operations.push(op);assert.equal(value.revision_hash,'same');return {};},onSaved:async()=>{},options:{}};
  await launchEditedWorkflow(args);assert.deepEqual(operations,['start']);
  operations=[];await assert.rejects(launchEditedWorkflow({...args,pack:{...args.pack,workflow:{...args.pack.workflow,enabled:false}}}),/已禁用/);assert.deepEqual(operations,[]);
});
