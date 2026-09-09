// Launch is the human confirmation of the current edit. Each subsequent request
// uses the exact returned revision, retaining the existing server-side CAS gates.
export async function launchEditedWorkflow({pack,dirty,save,request,onSaved,options}) {
  let current=dirty || !pack ? await save() : pack;
  if(!current.workflow.enabled)throw new Error('此流程已禁用，请先启用。');
  if(current.workflow.status!=='ready')current=await request('publish',{
    workflow_id:current.workflow.id,expected_revision:current.revision_hash,reviewed:true,
  });
  await onSaved(current);
  return request('start',{...options,workflow_id:current.workflow.id,revision_hash:current.revision_hash});
}
