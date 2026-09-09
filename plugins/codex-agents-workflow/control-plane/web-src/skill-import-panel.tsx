import { useEffect, useRef, useState } from 'react';
import { api, Field, ProviderField, Details, uid, type Json } from './shared';

export function SkillImportPanel({act, busy, providers, imported}: {act:(work:()=>Promise<any>)=>void, busy:number, providers:Json[], imported:(value:Json)=>Promise<void>}) {
  const [folder,setFolder] = useState('');
  const [provider,setProvider] = useState('$main');
  const [inventory,setInventory] = useState<Json|null>(null);
  const generation = useRef(0);
  const scan = (path:string) => { const ticket = ++generation.current; setInventory(null); act(async()=>{
    const result = await api('skill_inventory',{discovery:'folders',...(path.trim()?{folder:path.trim()}:{})});
    if (generation.current === ticket) setInventory({...result,folder:path.trim()});
  }); };
  useEffect(()=>{scan('');return ()=>{generation.current++;};},[]);
  return <main className="detail-page scroll"><span className="eyebrow">单向导入</span><h1>从 Skill 创建 Draft</h1>
    <p>默认扫描当前用户的 Codex 技能目录和插件缓存（通常位于 C:\Users\用户名\.codex）。也可以指定自己的文件夹。这里只发现可导入文件，不代表这些 Skill 已启用或获得执行权限。</p>
    <Field label="其他 Skill 文件夹（可选，绝对路径）" value={folder} onChange={value=>{setFolder(value);generation.current++;setInventory(null);}}/>
    <button disabled={busy>0} onClick={()=>scan(folder)}>扫描文件夹</button><button disabled={busy>0} onClick={()=>{setFolder('');scan('');}}>扫描默认 Codex 目录</button>
    <details><summary>高级导入设置</summary><p>初始草稿执行者。自动生成时会按规则为各步骤分别选择执行者。</p>
    <ProviderField providers={providers} value={provider} onChange={setProvider}/></details>
    {inventory && <><Details title="扫描范围与错误（缓存可能包含多个版本）" value={{...inventory,entries:undefined}}/>{inventory.entries.map((item:Json)=><article className="history-row" key={item.id}><div><strong>{item.name}</strong><p>{item.path}</p><small>{item.source_hash}</small></div><button disabled={!provider || busy>0} onClick={()=>act(async()=>imported(await api('import_skill',{discovery:'folders',...(inventory.folder?{folder:inventory.folder}:{}),skill_id:item.id,workflow_id:uid('import'),...(provider==='$main'?{}:{provider_id:provider})})))}>导入此版本</button></article>)}</>}
  </main>;
}
