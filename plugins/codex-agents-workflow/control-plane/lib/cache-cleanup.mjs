import {readdir,readFile,lstat,unlink,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {insideRoot,noSymlinks,requireValue} from './workflow-paths.mjs';
import {writeDurableJSON} from './workflow-events.mjs';
import {digest,canonicalJSON} from './workflow-revisions.mjs';

const exec=promisify(execFile);
const hashPattern=/^[a-f0-9]{64}$/;
function hashes(value,result=new Set()) {
  if(typeof value==='string' && hashPattern.test(value))result.add(value);
  else if(value && typeof value==='object')for(const item of Object.values(value))hashes(item,result);
  return result;
}
async function fileEntry(root,path,kind) {
  insideRoot(root,path);await noSymlinks(path);const info=await lstat(path);
  requireValue(info.isFile() && info.nlink===1,'CACHE_FILE_TYPE','Cache cleanup requires regular unlinked files');
  return {path,kind,bytes:info.size,sha256:digest(await readFile(path))};
}

// All retained metadata (including generation provenance) contributes pins.
// Mark first, then sweep revisions, then blobs. Never delete Run evidence.
export async function workflowCachePlan(store,runs) {
  const live=await store.list(),keep=new Set(),snapshots=[];
  for(const pack of live)hashes(pack,keep);
  for(const run of await runs.list())hashes((await runs.read(run.run_id)).pins,keep);
  for(const pack of live)for(const revision of await store.revisions(pack.workflow.id)) {
    snapshots.push(await store.snapshot(pack.workflow.id,revision.revision_hash));
  }
  let changed=true;
  while(changed) {const size=keep.size;for(const pack of snapshots)if(keep.has(pack.revision_hash))hashes(pack,keep);changed=keep.size!==size;}
  const files=[];
  for(const pack of live) {
    const root=insideRoot(store.root,join(store.root,`wf-${pack.workflow.id}.pack`));
    const retained=new Set();
    for(const old of snapshots.filter(p=>p.workflow.id===pack.workflow.id)) {
      if(keep.has(old.revision_hash))for(const item of old.resources)retained.add(item.sha256);
      else files.push(await fileEntry(root,join(root,'revisions',old.revision_hash+'.json'),'workflow_revision'));
    }
    await noSymlinks(join(root,'objects'));
    for(const item of await readdir(join(root,'objects'),{withFileTypes:true})) {
      requireValue(item.isFile() && hashPattern.test(item.name),'CACHE_OBJECT_TYPE','Unexpected Workflow object entry');
      if(!retained.has(item.name))files.push(await fileEntry(root,join(root,'objects',item.name),'workflow_resource'));
    }
  }
  return {files,retained_revisions:snapshots.length-files.filter(f=>f.kind==='workflow_revision').length};
}

async function pluginInventory(cacheRoot,env) {
  requireValue(process.platform==='win32','CACHE_PLATFORM','Plugin cache inspection currently requires Windows');
  // Only version names leave this probe. Never expose process command lines.
  const script=`$ErrorActionPreference='Stop'
$cacheRoot=$env:WORKFLOW_CLEANUP_CACHE_ROOT
$registryText=(& codex plugin list --marketplace codex-agents-workflow --json | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect installed plugin registry' }
$registry=$registryText | ConvertFrom-Json
$installed=@($registry.installed | Where-Object { $_.pluginId -eq 'codex-agents-workflow@codex-agents-workflow' } | ForEach-Object { $_.version })
if ($installed.Count -ne 1) { throw 'Expected exactly one installed Workflow plugin' }
$commands=@(Get-CimInstance Win32_Process | ForEach-Object { if ($_.CommandLine) { $_.CommandLine.Replace('/','\\').ToLowerInvariant() } })
$active=@(Get-ChildItem -LiteralPath $cacheRoot -Directory | Where-Object { $candidate=$_.FullName.ToLowerInvariant(); @($commands | Where-Object { $_.Contains($candidate) }).Count -gt 0 } | ForEach-Object { $_.Name })
$hosts=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'codex.exe' -and $_.CommandLine -match 'app-server' } | ForEach-Object { @{pid=$_.ProcessId;started_at=$_.CreationDate.ToUniversalTime().ToString('o')} })
@{installed=$installed;active=$active;hosts=$hosts} | ConvertTo-Json -Depth 4 -Compress`;
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:30000,maxBuffer:65536,env:{...env,WORKFLOW_CLEANUP_CACHE_ROOT:cacheRoot}});
  const state=JSON.parse(stdout);
  const retentionPath=resolve(cacheRoot,'../../../../codex-agents-workflow/runtime-retention.json');
  let retention={versions:{}};
  try{retention=JSON.parse(await readFile(retentionPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const live=new Set((state.hosts??[]).map(h=>`${h.pid}:${h.started_at}`));
  state.active.push(...Object.entries(retention.versions).filter(([,hosts])=>hosts.some(h=>live.has(`${h.pid}:${h.started_at}`))).map(([version])=>version));
  return state;
}
async function treeFiles(root,path=root,result=[]) {
  if(path!==root)insideRoot(root,path);await noSymlinks(path);
  for(const item of await readdir(path,{withFileTypes:true})) {
    const next=insideRoot(root,join(path,item.name));await noSymlinks(next);
    if(item.isDirectory())await treeFiles(root,next,result);
    else result.push(await fileEntry(root,next,'plugin_file'));
    requireValue(result.length<=50000,'CACHE_SCAN_LIMIT','Plugin cache exceeds scan limit');
  }
  return result;
}
export async function pluginCachePlan(home,{env=process.env,inventory=pluginInventory}={}) {
  const root=resolve(home,'plugins/cache/codex-agents-workflow/codex-agents-workflow');
  try {await lstat(root);}catch(error){if(error.code==='ENOENT')return {directories:[],retained_versions:[]};throw error;}
  await noSymlinks(root);
  const state=await inventory(root,env);
  requireValue(Array.isArray(state.installed) && state.installed.length===1 && Array.isArray(state.active),'CACHE_REGISTRY','Invalid installed plugin inspection');
  const keep=new Set([...state.installed,...state.active]);
  const current=fileURLToPath(import.meta.url).replaceAll('\\','/').toLowerCase();
  const config=await readFile(join(home,'config.toml'),'utf8');
  const directories=[];
  for(const entry of await readdir(root,{withFileTypes:true})) {
    const path=insideRoot(root,join(root,entry.name));await noSymlinks(path);
    requireValue(entry.isDirectory() && /^[0-9][A-Za-z0-9.+_-]*$/.test(entry.name),'CACHE_VERSION_ENTRY','Unexpected plugin version entry');
    if(current.startsWith(path.replaceAll('\\','/').toLowerCase()+'/') || config.includes(entry.name))keep.add(entry.name);
    if(keep.has(entry.name))continue;
    const manifest=JSON.parse(await readFile(join(path,'.codex-plugin/plugin.json'),'utf8'));
    requireValue(manifest.name==='codex-agents-workflow' && manifest.version===entry.name,'CACHE_PLUGIN_ID','Cached plugin identity differs');
    const files=await treeFiles(path);
    directories.push({path,version:entry.name,bytes:files.reduce((n,f)=>n+f.bytes,0),fingerprint:digest(canonicalJSON(files))});
  }
  return {directories,retained_versions:[...keep]};
}
export async function cleanupCaches({store,runs,home,auditRoot,env=process.env,preview=false,inventory}) {
  return store.withWriter(()=>runs.writer.withWriter(async()=>{
    const workflow=await workflowCachePlan(store,runs);
    const plugin=await pluginCachePlan(home,{env,inventory});
    const result={workflow_revisions:workflow.files.filter(f=>f.kind==='workflow_revision').length,workflow_resources:workflow.files.filter(f=>f.kind==='workflow_resource').length,plugin_versions:plugin.directories.length,bytes:workflow.files.reduce((n,f)=>n+f.bytes,0)+plugin.directories.reduce((n,d)=>n+d.bytes,0),retained_revisions:workflow.retained_revisions,retained_plugin_versions:plugin.retained_versions};
    if(preview)return result;
    const auditPath=insideRoot(auditRoot,join(auditRoot,'cache-cleanup-'+randomUUID()+'.json'));
    const audit={started_at:new Date().toISOString(),status:'running',planned:result,candidates:[...workflow.files,...plugin.directories],deleted:[]};
    await writeDurableJSON(auditPath,audit);
    try {
      for(const file of workflow.files) {
        const actual=await fileEntry(store.root,file.path,file.kind);
        requireValue(actual.sha256===file.sha256,'CACHE_CHANGED','Cache file changed during cleanup');
        await unlink(file.path);audit.deleted.push({path:file.path,bytes:file.bytes});await writeDurableJSON(auditPath,audit);
      }
      // Reinspect process and registry protections immediately before deletion.
      const fresh=await pluginCachePlan(home,{env,inventory});
      for(const directory of plugin.directories) {
        requireValue(fresh.directories.some(d=>d.path===directory.path && d.fingerprint===directory.fingerprint),'CACHE_CHANGED','Plugin version changed or became active; retry cleanup');
        insideRoot(resolve(home,'plugins/cache/codex-agents-workflow/codex-agents-workflow'),directory.path);
        await noSymlinks(directory.path);
        await rm(directory.path,{recursive:true});audit.deleted.push({path:directory.path,bytes:directory.bytes});await writeDurableJSON(auditPath,audit);
      }
      audit.status='complete';await writeDurableJSON(auditPath,audit);return {...result,audit_file:auditPath};
    }catch(error){audit.status='failed';audit.error=error.message;await writeDurableJSON(auditPath,audit);throw Object.assign(error,{details:{audit_file:auditPath,deleted: audit.deleted.length}});}
  }));
}
