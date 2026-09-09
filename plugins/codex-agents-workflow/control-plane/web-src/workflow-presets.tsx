import { useEffect, useState } from 'react';
import { api, type Json } from './shared';

export function WorkflowPresets({act,busy,onOpen}:{act:(work:()=>Promise<any>)=>void,busy:number,onOpen:(pack:Json)=>Promise<void>}) {
  const [presets,setPresets]=useState<Json[]>([]);
  useEffect(()=>{act(async()=>setPresets(await api('presets')));},[act]);
  return <details className="details"><summary>内置协作预设</summary><p>并行准备，依赖就绪后自动交接。添加后可直接使用，也可以修改。</p>
    {presets.map(preset=><div key={preset.id}><strong>{preset.name}</strong><p>{preset.description}</p>
      <button disabled={busy>0} onClick={()=>act(async()=>onOpen(await api('install_preset',{preset_id:preset.id})))}>添加或打开{preset.name}</button></div>)}
  </details>;
}
