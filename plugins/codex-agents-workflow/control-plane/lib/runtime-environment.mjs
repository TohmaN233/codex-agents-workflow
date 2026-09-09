import {access,readdir,realpath,stat} from 'node:fs/promises';
import {delimiter,join,resolve,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {requireValue} from './workflow-paths.mjs';

// Discovery does not execute, download or install anything. Host paths never enter
// reusable definitions; each Run resolves its own actual executable locations.
export async function discoverRuntimeEnvironment(requirements,{env=process.env,extraDirectories=[]}={}) {
 requireValue(Array.isArray(extraDirectories)&&extraDirectories.length<=32&&extraDirectories.every(p=>typeof p==='string'&&isAbsolute(p)),'ENVIRONMENT_DIRECTORIES','Tool search directories must be a bounded list of absolute directories');
 const names=[...new Set(requirements.executables??[])];
 const home=env.USERPROFILE||env.HOME||homedir();
 const roots=[join(home,'Miniconda3'),join(home,'miniconda3'),join(home,'anaconda3'),join(home,'miniconda3','Library','bin'),join(home,'miniconda3','Scripts'),join(home,'scoop','shims'),join(home,'.local','bin'),join(home,'.cargo','bin'),join(home,'.bun','bin'),join(home,'AppData','Local','Microsoft','WinGet','Links'),join(home,'AppData','Roaming','npm'),...extraDirectories];
 for(const base of [env.ProgramFiles,env['ProgramFiles(x86)'],join(home,'AppData','Local','Programs'),join(home,'.codex','vendor')].filter(Boolean)) {
  try {for(const item of await readdir(base,{withFileTypes:true}))if(item.isDirectory())roots.push(join(base,item.name),join(base,item.name,'bin'));}
  catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
 }
 const directories=[...new Set([...(env.PATH||env.Path||'').split(delimiter),...roots].filter(p=>p&&isAbsolute(p)).map(p=>resolve(p)))];
 const suffixes=process.platform==='win32'?['','.exe','.cmd','.bat']:[''];
 const tools=[];
 for(const name of names){
  requireValue(typeof name==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.+-]{0,99}$/.test(name),'ENVIRONMENT_DEPENDENCY_NAME','Executable dependencies must be program names, not commands or paths');
  let found=null;
  for(const directory of directories){for(const suffix of suffixes){const candidate=join(directory,name+suffix);try{const info=await stat(candidate);if(info.isFile()){await access(candidate);found=await realpath(candidate);break;}}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}}if(found)break;}
  tools.push({name,status:found?'found':'missing',path:found});
 }
 const missing=tools.filter(t=>t.status==='missing').map(t=>t.name);
 return {status:missing.length?'installation_approval_required':'ready',tools,missing,searched_directories:directories,installation_performed:false,
  next_action:missing.length?'These tools were not found in searched_directories; this is not proof they are absent from the host. Use host discovery across system, user, portable-tool and other relevant locations beyond the task workspace. Supply discovered folders in environment_directories to prepare_environment and start. Only if still unavailable, ask whether to install; never install without consent. Recheck before task execution.':'Proceed with the task using the resolved tool paths.'};
}
