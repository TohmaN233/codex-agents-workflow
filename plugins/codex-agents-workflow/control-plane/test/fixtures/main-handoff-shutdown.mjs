// Zero-model preload: establish a real Runtime/Main handoff, then let the
// unmodified stdio lifecycle in server.mjs own EOF shutdown and its error path.
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mkdir as mkdirAsync} from 'node:fs/promises';
import {join} from 'node:path';
import {WorkflowStore} from '../../lib/workflow-store.mjs';
import {WorkflowRuntime} from '../../lib/workflow-runtime.mjs';
import {runHistoryMaintenanceFor} from '../../lib/run-history-maintenance.mjs';
import {withForegroundActivity,foregroundActivityCount,foregroundPriorityPreparation,retainForegroundPriority} from '../../lib/foreground-activity.mjs';
import {prepareMainOrchestration} from '../../lib/execution/main-orchestration.mjs';
import {canonicalJSON,digest} from '../../lib/workflow-revisions.mjs';
import {readyWorkflow} from './workflow-fixtures.mjs';

const root=process.env.HANDOFF_PRIORITY_FIXTURE_ROOT,mode=process.env.HANDOFF_PRIORITY_FIXTURE_MODE;
if(!root||!['deferred','failure','stop_pending'].includes(mode))throw new Error('Exact shutdown fixture arguments required');
const thread='12345678-1234-4234-8234-123456789abc',workspace=join(root,'workspace');await mkdirAsync(workspace);
let launches=0,workerReady;
const ready=new Promise(resolve=>workerReady=resolve);
const manager=runHistoryMaintenanceFor({runRoot:join(root,'runs'),settlementMs:25,launchWorker:async options=>{
 launches++;await options.onReady(process.pid);workerReady();
 if(mode==='failure')throw Object.assign(new Error('Exact fixture maintenance failure'),{code:'FIXTURE_MAINTENANCE_FAILURE'});
 if(mode==='stop_pending')await new Promise(()=>{});
 return {examined:0,deleted_count:0,preserved_count:0};
}});
const workflow=readyWorkflow('shutdown-priority');workflow.skill_policy.mode='cooperative';workflow.nodes[1].executor.mode='orchestration';
const store=await new WorkflowStore(join(root,'packs')).initialize();await store.create(workflow);
const runtime=await new WorkflowRuntime({workflowStore:store,runRoot:manager.root,historyMaintenance:manager.hook}).initialize();
let run,binding;
await withForegroundActivity(manager.root,async()=>{
 run=await runtime.start({workflow_id:workflow.id,workspace,access:'read_only',main_actor:'root',constraints:{native_parent_thread_id:thread}});
 const lease=await runtime.claimHostMain(run.run_id,{node_id:'final',owner:'root',request_id:'claim',control_token:run.control_token});
 binding={node_id:'final',attempt_id:lease.attempt_id,lease_token:lease.lease_token,control_token:run.control_token};
 const envelope=await runtime.execution(run.run_id,binding);
 await runtime.recordHostMainDispatchIntent(run.run_id,{...binding,request_id:`dispatch-${lease.attempt_id}`,envelope_hash:digest(canonicalJSON(envelope))});
 await prepareMainOrchestration(runtime,{run_id:run.run_id,control_token:run.control_token,thread_id:thread});
 if(manager.task)await manager.task;
});
const state=(await runtime.runs.read(run.run_id)).state;
const identity={run_id:run.run_id,node_id:'final',attempt_id:binding.attempt_id,lease_generation:0,controller_binding_hash:runtime.mainForegroundControllerBinding(state)};
if(mode!=='deferred'){
 manager.schedule(runtime.runs);await ready;
 if(mode==='failure')await manager.task;
}
process.once('exit',()=>{
 let retention_error=null;try{retainForegroundPriority(manager.root,identity,foregroundPriorityPreparation(manager.root,run.run_id));}
 catch(error){retention_error=error.code;}
 let late_manager_error=null;try{runHistoryMaintenanceFor({runRoot:join(root,'late-runs')});}catch(error){late_manager_error=error.code;}
 writeFileSync(join(root,'shutdown-state.json'),JSON.stringify({count:foregroundActivityCount(manager.root),launches,closed:manager.closed,retention_error,late_manager_error,late_rpc_error}));
});
// Hold the real server's ping write callback so EOF shutdown stays in its
// scheduler drain while an actual fresh service RPC attempts to open a manager.
let pingWritten,releaseWrite,late_rpc_error=null;
const written=new Promise(resolve=>pingWritten=resolve),originalWrite=process.stdout.write.bind(process.stdout);
process.stdout.write=function(chunk,encoding,callback){
 if(String(chunk).includes('"id":901')){
  releaseWrite=typeof encoding==='function'?encoding:callback;
  return originalWrite(chunk,error=>{assert.ifError(error);pingWritten();});
 }
 return originalWrite(chunk,encoding,callback);
};
const {handleRpc}=await import('../../server.mjs');
process.stdin.once('end',()=>setImmediate(async()=>{
 try{
  await written;
  assert.equal(manager.closed,true,'Maintenance closes before scheduler write drain');
  const response=await handleRpc({jsonrpc:'2.0',id:902,method:'tools/call',params:{name:'workflow_list',arguments:{}}},
   {configPath:join(root,'late-config.json')});
  assert.equal(response.result.isError,true);assert.match(JSON.stringify(response),/RUN_HISTORY_MAINTENANCE_CLOSED/);
  late_rpc_error='RUN_HISTORY_MAINTENANCE_CLOSED';
 }catch(error){process.stderr.write(String(error.stack));process.exitCode=1;}
 finally{releaseWrite?.();}
}));
process.send({count:foregroundActivityCount(manager.root),launches});process.disconnect();
