import { useEffect, useState } from 'react';
import { api, Details, uid, type Json } from './shared';
import { rememberRun } from './run-panel';

const sessions = new Map<string,Json>();
const reviewLabels:Json={parallelism:'并行关系',agent_ownership:'主／子 Agent 分工',human_intervention:'人类介入',model_selection:'模型选择',phase_order:'阶段顺序',hard_rules:'原 Skill 硬性规则',data_handoffs:'数据交接',failure_semantics:'失败语义',conversation_inputs:'输入与反馈',human_confirmation:'确认时机',conditional_dependencies:'条件依赖',portable_artifact:'资源与环境分层',source_support:'来源依据覆盖',review_scope:'审核范围'};
function ReviewChecklist({result}:{result:Json}) {
  if(!Array.isArray(result?.checks))return <Details title="历史审核结果" value={result}/>;
  return <><p>审核结论：{result.approved?'通过':'未通过'}（程序按逐项结果汇总）</p><table><thead><tr><th>检查项</th><th>结果</th><th>证据与依据</th></tr></thead><tbody>{result.checks.map((check:Json)=><tr key={check.id}><td>{reviewLabels[check.id] ?? check.id}</td><td>{{pass:'通过',fail:'未通过',not_applicable:'不适用'}[check.status as string]}</td><td>{check.evidence}<Details title="节点、连线和来源" value={{node_ids:check.node_ids,edge_ids:check.edge_ids,source_spans:check.source_spans}}/></td></tr>)}</tbody></table></>;
}

export function SkillGeneration({pack,routing,provider,workspace,saved,openRun}: {pack:Json,routing:Json|null,provider:string,workspace:string,saved:(pack:Json)=>Promise<void>,openRun:(run:Json)=>void}) {
  const sessionKey = pack.workflow.id+'/'+pack.revision_hash;
  const [run,setRun] = useState<Json|null>(()=>sessions.get(sessionKey) ?? null);
  const [progress,setProgress] = useState<Json|null>(null);
  const [error,setError] = useState<Json|null>(null);
  const [login,setLogin] = useState<Json|null>(null);
  const [busy,setBusy] = useState(false);
  const [stopping,setStopping] = useState(false);
  const control = run ? {run_id:run.run_id,control_token:run.control_token} : null;
  const fail = (cause:any)=>setError({message:cause.message,...cause.detail});
  useEffect(()=>{
    if (!run || stopping || error || ['review_required','ready_to_apply','attention','approval','authentication_required'].includes(progress?.phase)) return;
    let active=true; let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try { const next=await api('advance_generation',{run_id:run.run_id,control_token:run.control_token}); if(active){setProgress(next); if(!['review_required','ready_to_apply','attention','approval','authentication_required'].includes(next.phase)) timer=setTimeout(poll,2000);} }
      catch(cause){if(active)fail(cause);}
    };
    timer=setTimeout(poll,0);
    return ()=>{active=false;clearTimeout(timer);};
  },[run,error,stopping,progress?.phase]);
  async function start(){
    setBusy(true);setError(null);setProgress(null);setStopping(false);
    try {const result=await api('start_generation',{workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:uid('generation'),...(routing?{routing_rules:routing}:{}),...(provider?{provider_id:provider}:{}),...(workspace?{workspace}:{})});rememberRun(result);sessions.set(sessionKey,result);setRun(result);}
    catch(cause){fail(cause);}finally{setBusy(false);}
  }
  async function accept(){setBusy(true);try{const result=await api('accept_generation',{...control,accepted:true});sessions.delete(sessionKey);await saved(result);}catch(cause){fail(cause);}finally{setBusy(false);}}
  const labels:Json={repairing:progress?.review_only?'正在补正审核清单（保留生成结果）…':'正在根据检查意见自动修正…',generating:'正在生成工作流…',reviewing:'正在检查生成结果…',review_required:'生成与检查已完成，请查看结果',ready_to_apply:'检查已确认，可以保存草稿',authentication_required:'所选独立登录模式需要完成登录',approval:'需要你允许本次模型调用',attention:'生成已停止，需要处理'};
  return <section className="generation-panel"><h2>从 Skill 自动生成工作流</h2><p>自动安排步骤、按规则选择执行者并检查结果。工作目录由系统准备，通常无需设置。</p>
    {!run && <button className="primary" disabled={busy} onClick={start}>{busy?'正在准备…':'自动生成工作流'}</button>}
    {run && <p role="status">{stopping?'正在停止并确认会话退出…':labels[progress?.phase] ?? '正在准备生成…'}</p>}
    {progress?.progress && <p>第 {progress.progress.round} / {progress.progress.max_rounds} 轮 · {progress.progress.model} / {progress.progress.effort} · 本阶段已用 {Math.floor(progress.progress.stage_elapsed_ms/1000)} 秒 · 近期资源读取 {progress.progress.resource_reads} 次（最近 64 条事件）{progress.progress.activity==='compacting'?' · 正在压缩上下文':''}{progress.progress.last_resource?' · 最近读取 '+progress.progress.last_resource:''}</p>}
    {progress?.live?.output_preview?.text && <Details title="模型当前输出（尚未验收）" value={progress.live.output_preview.text}/>}
    {run && <button disabled={busy || stopping || progress?.status==='cancelled'} onClick={async()=>{setBusy(true);setStopping(true);try{await api('cancel',control!);setProgress({phase:'attention',status:'cancelled'});}catch(cause){fail(cause);}finally{setBusy(false);setStopping(false);}}}>停止生成</button>}
    {progress?.status==='cancelled' && <button onClick={()=>{sessions.delete(sessionKey);setRun(null);setProgress(null);setError(null);}}>返回生成入口（保留历史记录）</button>}
    {error && <div role="alert"><p>生成未完成：{error.message}</p><Details title="错误详情" value={error}/></div>}
    {progress?.phase==='review_required' && <><h3>生成的步骤</h3><ol>{progress.workflow?.nodes?.filter((node:Json)=>node.executor).map((node:Json)=><li key={node.id}>{node.name || node.id}{' — '+(node.executor.kind==='provider'?node.executor.provider_id:node.executor.kind==='main'?(node.id==='final'?'主 Agent 最终确认':'主 Agent'):node.executor.kind==='human'?'用户确认':node.executor.kind)}{node.access?'（'+(node.access==='read_only'?'只读':node.access)+'）':''}</li>)}</ol><p>结构检查：{progress.validation?.valid?'通过':'未通过'}；最终确认：{progress.workflow?.finalization?.required?'必须完成':'未要求'}。</p><Details title="编排决策：并行、主／子 Agent、人类介入" value={progress.proposal?.planning_analysis}/><p>审核通过表示转换语义通过；下列启动限制不会被自动清除。</p><Details title="启动条件与待确认事项" value={progress.validation?.blockers}/><h3>逐项审核清单</h3><ReviewChecklist result={progress.review?.structured_output}/><Details title="查看完整草稿和检查证据" value={{workflow:progress.workflow,validation:progress.validation,proposal:progress.proposal,review:progress.review}}/></>}
    {['review_required','ready_to_apply'].includes(progress?.phase) && <button className="primary" disabled={busy} onClick={accept}>我确认所示步骤和连线，保存为可编辑草稿</button>}
    {progress?.phase==='approval' && progress.approvals.map((approval:Json)=><div key={approval.id}><Details title="本次调用的权限要求" value={approval}/><button disabled={busy} onClick={async()=>{setBusy(true);try{await api('approve',{...control,approval_id:approval.id,decision:true});setProgress(null);}catch(cause){fail(cause);}finally{setBusy(false);}}}>允许此次调用并继续</button></div>)}
    {progress?.phase==='authentication_required' && <div><p>此操作仅用于你主动选择的独立登录模式。完成登录后继续。</p>{progress.live?.status==='auth_required' && <button disabled={busy} onClick={async()=>{setBusy(true);try{const value=await api('login_generation',control!);setLogin(value);setProgress({...progress,live:value});}catch(cause){fail(cause);}finally{setBusy(false);}}}>获取官方登录链接</button>}{login?.auth_url && <a href={login.auth_url} target="_blank" rel="noreferrer">打开官方登录页面</a>}<button onClick={()=>{setError(null);setProgress(null);}}>登录完成，继续</button></div>}
    {progress?.phase==='repairing' && <p>第 {progress.round} 轮：已将具体问题反馈给生成模型。</p>}
    {progress?.phase==='attention' && <Details title="停止原因" value={progress}/>}
    {run && <details><summary>运行详情与恢复（高级）</summary><button onClick={()=>openRun(run)}>查看详细运行</button>{error && <button onClick={()=>{setError(null);setProgress(null);}}>重新检查此任务状态</button>}</details>}
  </section>;
}
