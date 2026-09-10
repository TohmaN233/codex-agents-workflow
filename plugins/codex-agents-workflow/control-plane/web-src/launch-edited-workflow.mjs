// Publication and task execution are separate actions. Both retain exact revision pins.
import { t } from '../web/i18n.js';
export async function publishEditedWorkflow({pack,dirty,save,request,onSaved}) {
  let current=dirty || !pack ? await save() : pack;
  if(current.workflow.status!=='ready')current=await request('publish',{
    workflow_id:current.workflow.id,expected_revision:current.revision_hash,reviewed:true,
  });
  await onSaved(current);
  return current;
}
export async function launchEditedWorkflow({pack,dirty,request,options}) {
  if(dirty || !pack || pack.workflow.status!=='ready')throw new Error(t('请先发布工作流，再运行任务。', 'Publish the workflow before running a task.'));
  if(!pack.workflow.enabled)throw new Error(t('此流程已禁用，请先启用并发布。', 'This workflow is disabled. Enable and publish it first.'));
  return request('start',{...options,workflow_id:pack.workflow.id,revision_hash:pack.revision_hash});
}
