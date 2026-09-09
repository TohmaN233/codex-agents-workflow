import {useState} from 'react';
import {api,Details,type Json} from './shared';
export function CacheCleanup({act,busy}:{act:(fn:()=>Promise<unknown>)=>unknown,busy:number}) {
  const [result,setResult]=useState<Json|null>(null);
  const [preview,setPreview]=useState(false);
  return <details><summary>旧版本缓存清理</summary><p>一键清理未引用的工作流历史版本、资源及本插件旧安装缓存。保留当前版本、运行记录和固定引用、正在使用的插件版本。已清理的历史版本不能恢复。</p>
    <button disabled={busy>0} onClick={()=>act(async()=>{setResult(await api('cache_cleanup_preview'));setPreview(true);})}>查看可清理空间</button>{' '}
    <button disabled={busy>0} onClick={()=>act(async()=>{setResult(await api('cleanup_caches'));setPreview(false);})}>一键清理旧版本缓存</button>
    {result && <><p>{preview?'可清理':'已清理'}：{result.workflow_revisions} 个工作流历史版本、{result.workflow_resources} 个资源、{result.plugin_versions} 个插件旧版本，共 {(result.bytes/1024/1024).toFixed(2)} MB。</p><Details title="清理详情与保留记录" value={result}/></>}
  </details>;
}
