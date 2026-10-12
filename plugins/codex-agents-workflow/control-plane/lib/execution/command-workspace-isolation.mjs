import {randomUUID} from 'node:crypto';
import {readFile,rm,lstat} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {requireValue} from '../workflow-paths.mjs';

const inside=(root,target)=>{const path=relative(root,target);return path===''||!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep);};

/** Qualify the actual command/exec permission boundary, without a model turn. */
export async function qualifyCommandWorkspaceIsolation({client,workspace,nodeBinary,sandboxPolicy,isolation,onOperation,commandEnvironment,beforeLaunch}){
  const root=resolve(workspace),readPath=resolve(isolation.read_path);
  requireValue(!inside(root,readPath)&&Array.isArray(isolation.outside_directories)&&isolation.outside_directories.length>0,
    'CODEX_COMMAND_ISOLATION','Isolation qualification requires an outside read fixture and denied directories');
  const directories=[...new Set([...isolation.outside_directories.map(path=>resolve(path)),...(commandEnvironment?[resolve(commandEnvironment.TEMP,'..')]:[])])];
  for(const directory of directories)requireValue(!inside(root,directory),
    'CODEX_COMMAND_ISOLATION','Isolation denied target must be outside the worker root');
  for(const directory of directories)requireValue((await lstat(directory)).isDirectory(),'CODEX_COMMAND_ISOLATION','Isolation denied directory is unavailable');
  const id=randomUUID(),name=`.workflow-isolation-${id}`,own=join(root,name),denied=directories.map(path=>join(path,name));
  const expected=await readFile(readPath,'utf8'),errors=[];const tempOwn=commandEnvironment?join(commandEnvironment.TEMP,name):null;
  try{
    await onOperation({phase:'isolation_begin',process_id:id});
    if(beforeLaunch)beforeLaunch();
    const script=`const fs=require('node:fs');const data=${JSON.stringify({readPath,own,denied,id,tempOwn})};const read=fs.readFileSync(data.readPath,'utf8');fs.writeFileSync(data.own,data.id,{flag:'wx'});if(data.tempOwn)fs.writeFileSync(data.tempOwn,data.id,{flag:'wx'});const denied=data.denied.map(path=>{try{fs.writeFileSync(path,data.id,{flag:'wx'});return false;}catch(error){if(!['EACCES','EPERM','EROFS'].includes(error.code))throw error;return true;}});process.stdout.write(JSON.stringify({read,denied}));`;
    const response=await client.call('command/exec',{command:[nodeBinary,'-e',script],processId:id,cwd:root,timeoutMs:10000,sandboxPolicy,...(commandEnvironment?{env:commandEnvironment}:{})},{timeout:15000}).catch(error=>{
      throw Object.assign(new Error('Exact command sandbox capability was not confirmed before model dispatch',{cause:error}),{code:'CODEX_COMMAND_ISOLATION_UNCONFIRMED'});
    });
    requireValue(response.exitCode===0&&response.stderr===''&&typeof response.stdout==='string','CODEX_COMMAND_ISOLATION','Actual sandbox could not execute its isolation qualification');
    let result;try{result=JSON.parse(response.stdout);}catch{requireValue(false,'CODEX_COMMAND_ISOLATION','Isolation qualification returned malformed evidence');}
    const ownWrite=await readFile(own,'utf8')===id,read=result.read===expected;const tempWrite=!tempOwn||await readFile(tempOwn,'utf8')===id;
    await onOperation({phase:'isolation_observed',process_id:id,read_allowed:read,own_write_allowed:ownWrite,outside_writes_denied:result.denied});
    requireValue(read&&ownWrite&&tempWrite&&result.denied?.length===denied.length&&result.denied.every(value=>value===true),
      'CODEX_COMMAND_ISOLATION','Actual command sandbox permits writes outside the assigned workspace or denies required access',{read_allowed:read,own_write_allowed:ownWrite,outside_writes_denied:result.denied});
    for(const path of denied){let exists=true;try{await lstat(path);}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}requireValue(!exists,'CODEX_COMMAND_ISOLATION','Outside write succeeded during command isolation qualification');}
    await onOperation({phase:'isolation_qualified',process_id:id});
  }catch(error){errors.push(error);}
  // These unpredictable names belong solely to this probe, including any leaked
  // writes. Preserve the failure while removing only those exact owned files.
  for(const path of [own,...denied,...(tempOwn?[tempOwn]:[])])try{await rm(path,{force:true});}catch(error){errors.push(error);}
  if(errors.length===1)throw errors[0];
  if(errors.length)throw Object.assign(new AggregateError(errors,'Command isolation qualification and cleanup failed'),{code:'CODEX_COMMAND_ISOLATION'});
}
