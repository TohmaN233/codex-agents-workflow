import test from 'node:test';
import assert from 'node:assert/strict';
import {committedTerminalOutput} from '../lib/execution/terminal-output.mjs';
import {WorkflowDrive} from '../lib/workflow-drive.mjs';
import {HostMainManager} from '../lib/execution/host-main-manager.mjs';

test('successful aggregate terminal output preserves large exact semantic data without truncation',async()=>{
 const output={first:{links:'x'.repeat(200000)+'FIRST'},second:{links:'y'.repeat(200000)+'SECOND'},semantic_result:'[neutral](G:/neutral/output.html) 😀'};
 const state={status:'succeeded',output,nodes:{}},record={state,pins:{root:{workflow:{nodes:[]}}}};
 const drive=new WorkflowDrive({runtime:{authorizedPlanningRun:async()=>({record,next:{}})}});
 const result=await drive.advanceToMain('neutral-run',{control_token:'neutral',owner:'main'});
 assert.deepEqual(result.output,output);result.output.first.links='changed';assert.equal(state.output.first.links.length,200005);
 assert.deepEqual(committedTerminalOutput({status:'succeeded',output:null}),{output:null});
});
test('terminal non-success keeps failure semantics and never exposes a stale successful output',async()=>{
 for(const status of ['failed','cancelled','blocked','running'])assert.deepEqual(committedTerminalOutput({status,output:{accepted:true}}),{});
 assert.deepEqual(committedTerminalOutput({status:'succeeded'}),{});
});
test('Host Main public terminal outcome returns committed semantic output',async()=>{
 const manager=new HostMainManager({configPath:'neutral-terminal',getConfig:async()=>({}),qualify:async()=>({})});
 const output={accepted:true,semantic_result:'[neutral](G:/neutral/output.html)'},entry={runId:'neutral-terminal-run',status:'running',stopping:false,cleanupPending:false,broker:null,session:null,
  handoff:{stop_reason:'main_node',host_binding:{node_id:'main'}},runtime:{get:async()=>({status:'succeeded',output})}};
 manager.executeNode=async()=>({final_acceptance_required:false});manager.entries.set(entry.runId,entry);
 const result=await manager.executeLoop(entry);assert.equal(result.status,'succeeded');assert.deepEqual(result.outcome.output,output);
});
