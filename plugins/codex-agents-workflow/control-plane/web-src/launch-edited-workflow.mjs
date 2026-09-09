// Publication and task execution are separate actions. Both retain exact revision pins.
export async function publishEditedWorkflow({pack,dirty,save,request,onSaved}) {
  let current=dirty || !pack ? await save() : pack;
  if(current.workflow.status!=='ready')current=await request('publish',{
    workflow_id:current.workflow.id,expected_revision:current.revision_hash,reviewed:true,
  });
  await onSaved(current);
  return current;
}
export async function launchEditedWorkflow({pack,dirty,request,options}) {
  if(dirty || !pack || pack.workflow.status!=='ready')throw new Error('请先发布工作流，再运行任务。');
  if(!pack.workflow.enabled)throw new Error('此流程已禁用，请先启用并发布。');
  return request('start',{...options,workflow_id:pack.workflow.id,revision_hash:pack.revision_hash});
}
