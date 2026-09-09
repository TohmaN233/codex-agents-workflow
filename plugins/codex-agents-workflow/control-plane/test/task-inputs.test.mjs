import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTaskInputs} from '../lib/task-inputs.mjs';
import {pathBoundaries,intersectBoundaries} from '../lib/workflow-bindings.mjs';
import {pathAllowed} from '../connectors/scope-guard.mjs';

test('task input preparation preserves schema and invokes main only when needed',async()=>{
  const base={inputs:{task:'Translate foo.txt into Chinese'},schema:{type:'object',additionalProperties:false,required:['file','language'],properties:{file:{type:'string'},language:{type:'string'}}}};
  const result=await prepareTaskInputs({...base,runModel:async request=>{assert.equal(request.inputs.task,base.inputs.task);return {ready:true,inputs_json:'{"file":"foo.txt","language":"Chinese"}',questions:[]};}});
  assert.deepEqual(result,{file:'foo.txt',language:'Chinese'});
  assert.deepEqual(await prepareTaskInputs({...base,inputs:result,runModel:async()=>assert.fail('No redundant model call')}),result);
  await assert.rejects(prepareTaskInputs({...base,runModel:async()=>({ready:false,questions:['Which source file?']})}),{code:'TASK_INFORMATION_REQUIRED'});
  await assert.rejects(prepareTaskInputs({...base,runModel:async()=>({ready:true,inputs_json:'{}'})}),{code:'DATA_INVALID'});
});
test('whole-project boundary intersects narrower scopes without allowing escapes',()=>{
  assert.deepEqual(pathBoundaries(['.']),['.']);
  assert.deepEqual(intersectBoundaries(['.'],['src']),['src']);
  assert.deepEqual(intersectBoundaries(['src'],['.']),['src']);
  assert(pathAllowed('new/result.txt',['.']));
  assert(!pathAllowed('../outside.txt',['.']));
  assert(!pathAllowed('C:/outside.txt',['.']));
  assert.throws(()=>pathBoundaries(['']),{code:'PATH_SCOPE'});
  assert.throws(()=>pathBoundaries(['../outside']),{code:'PATH_SCOPE'});
});
