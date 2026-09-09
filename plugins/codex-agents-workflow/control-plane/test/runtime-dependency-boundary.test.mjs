import test from 'node:test';
import assert from 'node:assert/strict';
import {readyWorkflow} from './workflow-validator.test.mjs';
import {validateWorkflowGraph} from '../lib/workflow-validator.mjs';
test('agent-managed executable and environment dependencies do not block launch on absent host inventory',()=>{
 const workflow=readyWorkflow();workflow.requirements.executables=['python'];workflow.requirements.environment=['VIDEO_TOOL_HOME'];
 const result=validateWorkflowGraph(workflow,{check_runtime_requirements:true});
 assert.equal(result.launch_ready,true,JSON.stringify(result.blockers));
 workflow.requirements.tools=['unregistered_tool'];
 assert.equal(validateWorkflowGraph(workflow,{check_runtime_requirements:true}).launch_ready,false);
});
