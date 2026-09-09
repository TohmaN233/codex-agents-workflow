import {cp,mkdir,readdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {noSymlinks,requireValue,ensureDirectory,insideRoot} from '../control-plane/lib/workflow-paths.mjs';

async function verifyCopy(source,target){
 await noSymlinks(source);await noSymlinks(target);
 for(const entry of await readdir(source,{withFileTypes:true})){
  const from=join(source,entry.name),to=join(target,entry.name);
  await noSymlinks(from);await noSymlinks(to);
  if(entry.isDirectory())await verifyCopy(from,to);
  else requireValue((await readFile(from)).equals(await readFile(to)),'PLUGIN_REVISION_CHANGED',`Retained revision differs: ${to}`);
 }
}

export function liveHosts(env=process.env){
 if(process.platform!=='win32')throw Error('Live plugin retention currently requires Windows');
 const script="$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'codex.exe' -and $_.CommandLine -match 'app-server' } | ForEach-Object { @{pid=$_.ProcessId; started_at=$_.CreationDate.ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress -AsArray";
 // Windows PowerShell does not support ConvertTo-Json -AsArray.
 const compatible=script.replace(' }) | ConvertTo-Json -Compress -AsArray',' }); ConvertTo-Json -InputObject $hosts -Compress').replace('@(Get-CimInstance','$hosts=@(Get-CimInstance');
 return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',compatible],{encoding:'utf8',windowsHide:true,env}));
}

// Retain complete immutable revisions because the running host caches their paths.
// The CLI install is still authoritative; this preserves files it garbage-collects.
export async function installRetainingRevisions({home,install,hosts=[],name='codex-agents-workflow',marketplace=name}){
 const cache=join(home,'plugins/cache',marketplace,name),stateRoot=join(home,name);
 await mkdir(stateRoot,{recursive:true});await noSymlinks(stateRoot);
 const recordPath=join(stateRoot,'runtime-retention.json');
 let record={versions:{}};
 try{record=JSON.parse(await readFile(recordPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const backup=join(stateRoot,'upgrade-backups',randomUUID());await mkdir(backup,{recursive:true});
 let entries=[];try{entries=await readdir(cache,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
 const retained=[],skipped=[];
 if(record.incomplete_versions===undefined)record.incomplete_versions={};
 requireValue(record.incomplete_versions&&typeof record.incomplete_versions==='object'&&!Array.isArray(record.incomplete_versions),'PLUGIN_RETENTION_RECORD','Incomplete-version retention record is invalid');
 for(const entry of entries){
  requireValue(entry.isDirectory()&&/^[0-9][A-Za-z0-9.+_-]*$/.test(entry.name),'PLUGIN_CACHE_ENTRY','Unexpected cached version');
  const path=join(cache,entry.name);await noSymlinks(path);
  let manifest;
  try{manifest=JSON.parse(await readFile(join(path,'.codex-plugin/plugin.json'),'utf8'));}
  catch(error){
   if(error.code!=='ENOENT')throw error;
   const observation={reason:'missing_manifest',observed_at:new Date().toISOString()};
   record.incomplete_versions[entry.name]=observation;skipped.push(entry.name);
   continue;
  }
  requireValue(manifest.name===name&&manifest.version===entry.name,'PLUGIN_CACHE_IDENTITY','Cached plugin identity differs');
  delete record.incomplete_versions[entry.name];
  await cp(path,join(backup,entry.name),{recursive:true,errorOnExist:true,force:false});
  await verifyCopy(path,join(backup,entry.name));
  retained.push(entry.name);
  record.versions[entry.name]=[...new Map([...(record.versions[entry.name]??[]),...hosts].map(h=>[`${h.pid}:${h.started_at}`,h])).values()];
 }
 // Persist protection before install, so concurrent cleanup cannot remove the lease.
 const temp=recordPath+'.'+randomUUID();await writeFile(temp,JSON.stringify(record,null,2));await rename(temp,recordPath);
 let installError;
 try{await install();}catch(error){installError=error;}
 const restoreErrors=[];
 for(const version of retained)try{
  const target=join(cache,version);await ensureDirectory(target);
  await cp(join(backup,version),target,{recursive:true,force:false,errorOnExist:false});
  await verifyCopy(join(backup,version),target);
 }catch(error){restoreErrors.push(error);}
 if(installError||restoreErrors.length)throw new AggregateError([...(installError?[installError]:[]),...restoreErrors],`Plugin upgrade failed; recovery snapshot retained at ${backup}`);
 await rm(insideRoot(resolve(stateRoot,'upgrade-backups'),resolve(backup)),{recursive:true});
 return {retained_versions:retained,skipped_incomplete_versions:skipped,host_count:hosts.length};
}

export async function updateLegacyEntrypoints(home,root,versions){
 const manifest=JSON.parse(await readFile(join(root,'.codex-plugin/plugin.json'),'utf8'));
 const source=await readFile(join(root,'scripts/mcp-bootstrap.cjs'),'utf8');
 const bridge="import {createRequire} from 'node:module';\nconst require=createRequire(import.meta.url);\nconst module={exports:{}};\n"+source+"\nawait boot();\n";
 for(const version of versions.filter(v=>v!==manifest.version)){
  requireValue(/^[0-9][A-Za-z0-9.+_-]*$/.test(version),'PLUGIN_VERSION','Invalid retained version');
  const entry=join(home,'plugins/cache/codex-agents-workflow/codex-agents-workflow',version,'control-plane/server.mjs');
  await noSymlinks(entry);
  const temp=entry+'.'+randomUUID();await writeFile(temp,bridge);await rename(temp,entry);
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const home=process.env.CODEX_HOME||join(homedir(),'.codex');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const manifest=JSON.parse(await readFile(join(root,'.codex-plugin/plugin.json'),'utf8'));
 requireValue(manifest.name==='codex-agents-workflow','PLUGIN_IDENTITY','Wrong plugin source');
 const result=await installRetainingRevisions({home,hosts:liveHosts(),install:()=>execFileSync('codex',['plugin','add','codex-agents-workflow@codex-agents-workflow'],{stdio:'inherit',windowsHide:true})});
 await updateLegacyEntrypoints(home,root,result.retained_versions);
 console.log(JSON.stringify(result));
}
