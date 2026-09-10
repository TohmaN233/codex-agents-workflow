import { useEffect, useState } from 'react';
import { api, Details, uid, useLocale, type Json } from './shared';
import { rememberRun } from './run-panel';

const sessions = new Map<string,Json>();
const reviewLabels:Record<string,[string,string]>={parallelism:['并行关系','Parallelism'],agent_ownership:['Main／Codex task 分工','Main/Codex task ownership'],human_intervention:['人类介入','Human intervention'],model_selection:['模型选择','Model selection'],phase_order:['阶段顺序','Phase order'],hard_rules:['原 Skill 硬性规则','Original Skill hard rules'],data_handoffs:['数据交接','Data handoffs'],failure_semantics:['失败语义','Failure semantics'],conversation_inputs:['输入与反馈','Conversation inputs and feedback'],human_confirmation:['确认时机','Confirmation timing'],conditional_dependencies:['条件依赖','Conditional dependencies'],portable_artifact:['资源与环境分层','Portable artifact layers'],source_support:['来源依据覆盖','Source support coverage'],review_scope:['审核范围','Review scope']};
function ReviewChecklist({result}:{result:Json}) {
  const t = useLocale();
  if(!Array.isArray(result?.checks))return <Details title={t('历史审核结果','Historical review result')} value={result}/>;
  const statusLabels:Record<string,[string,string]>={pass:['通过','Pass'],fail:['未通过','Fail'],not_applicable:['不适用','Not applicable']};
  return <><p>{t('审核结论：','Review conclusion: ')}{result.approved?t('通过','Passed'):t('未通过','Not passed')}{t('（程序按逐项结果汇总）',' (summarized from each check)')}</p><table><thead><tr><th>{t('检查项','Check')}</th><th>{t('结果','Result')}</th><th>{t('证据与依据','Evidence and basis')}</th></tr></thead><tbody>{result.checks.map((check:Json)=><tr key={check.id}><td>{reviewLabels[check.id] ? t(...reviewLabels[check.id]) : check.id}</td><td>{statusLabels[check.status as string] ? t(...statusLabels[check.status as string]) : check.status}</td><td>{check.evidence}<Details title={t('节点、连线和来源','Nodes, edges, and sources')} value={{node_ids:check.node_ids,edge_ids:check.edge_ids,source_spans:check.source_spans}}/></td></tr>)}</tbody></table></>;
}

export function SkillGeneration({pack,routing,workspace,saved,openRun}: {pack:Json,routing:Json|null,workspace:string,saved:(pack:Json)=>Promise<void>,openRun:(run:Json)=>void}) {
  const t = useLocale();
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
    try {const result=await api('start_generation',{workflow_id:pack.workflow.id,revision_hash:pack.revision_hash,run_id:uid('generation'),...(routing?{routing_rules:routing}:{}),...(workspace?{workspace}:{})});rememberRun(result);sessions.set(sessionKey,result);setRun(result);}
    catch(cause){fail(cause);}finally{setBusy(false);}
  }
  async function accept(){setBusy(true);try{const result=await api('accept_generation',{...control,accepted:true});sessions.delete(sessionKey);await saved(result);}catch(cause){fail(cause);}finally{setBusy(false);}}
  const labels:Json={repairing:progress?.review_only?t('正在补正审核清单（保留生成结果）…','Repairing the review checklist (keeping the generated result)…'):t('正在根据检查意见自动修正…','Applying automatic fixes from review feedback…'),generating:t('正在生成工作流…','Generating workflow…'),reviewing:t('正在检查生成结果…','Reviewing the generated result…'),review_required:t('生成与检查已完成，请查看结果','Generation and review are complete; inspect the result'),ready_to_apply:t('检查已确认，可以保存草稿','Review confirmed; the draft can be saved'),authentication_required:t('所选独立登录模式需要完成登录','The selected managed login mode requires authentication'),approval:t('需要你允许本次模型调用','Your approval is needed for this model call'),attention:t('生成已停止，需要处理','Generation stopped; attention is required')};
  return <section className="generation-panel"><h2>{t('从 Skill 生成 Workflow（自动选择）','Generate a workflow from a Skill (automatic routing)')}</h2><p>{t('自动安排步骤，在 Main 与 Codex task thread 之间分配执行者并检查结果。工作目录由系统准备，通常无需设置。','Automatically arranges steps, assigns executors between Main and Codex task threads, and reviews the result. The system prepares the workspace, so setup is usually unnecessary.')}</p>
    {!run && <button className="primary" disabled={busy} onClick={start}>{busy?t('正在准备…','Preparing…'):t('自动生成 Workflow','Generate workflow automatically')}</button>}
    {run && <p role="status">{stopping?t('正在停止并确认会话退出…','Stopping and confirming session exit…'):labels[progress?.phase] ?? t('正在准备生成…','Preparing generation…')}</p>}
    {progress?.progress && <p>{t('第 ','Round ')}{progress.progress.round} / {progress.progress.max_rounds} · {progress.progress.model} / {progress.progress.effort} · {t('本阶段已用 ','Stage time: ')}{Math.floor(progress.progress.stage_elapsed_ms/1000)} {t('秒','s')} · {t('近期资源读取 ','Recent resource reads: ')}{progress.progress.resource_reads} {t('次（最近 64 条事件）',' (last 64 events)')}{progress.progress.activity==='compacting'?t(' · 正在压缩上下文',' · Compacting context'):''}{progress.progress.last_resource?t(' · 最近读取 ',' · Last read ')+progress.progress.last_resource:''}</p>}
    {progress?.live?.output_preview?.text && <Details title={t('模型当前输出（尚未验收）','Current model output (not yet accepted)')} value={progress.live.output_preview.text}/>}
    {run && <button disabled={busy || stopping || progress?.status==='cancelled'} onClick={async()=>{setBusy(true);setStopping(true);try{await api('cancel',control!);setProgress({phase:'attention',status:'cancelled'});}catch(cause){fail(cause);}finally{setBusy(false);setStopping(false);}}}>{t('停止生成','Stop generation')}</button>}
    {progress?.status==='cancelled' && <button onClick={()=>{sessions.delete(sessionKey);setRun(null);setProgress(null);setError(null);}}>{t('返回生成入口（保留历史记录）','Return to generation (keep history)')}</button>}
    {error && <div role="alert"><p>{t('生成未完成：','Generation did not finish: ')}{error.message}</p><Details title={t('错误详情','Error details')} value={error}/></div>}
    {progress?.phase==='review_required' && <><h3>{t('生成的步骤','Generated steps')}</h3><ol>{progress.workflow?.nodes?.filter((node:Json)=>node.executor).map((node:Json)=><li key={node.id}>{node.name || node.id}{' — '+(node.executor.kind==='provider'?node.executor.provider_id:node.executor.kind==='thread'?t('Codex task','Codex task'):node.executor.kind==='main'?(node.id==='final'?t('主 Agent 最终确认','Main Agent final acceptance'):t('主 Agent','Main Agent')):node.executor.kind==='human'?t('用户确认','User confirmation'):node.executor.kind)}{node.access ? `${t('（', ' (')}${node.access==='read_only'?t('只读','read-only'):node.access}${t('）', ')')}` : ''}</li>)}</ol><p>{t('结构检查：','Structure check: ')}{progress.validation?.valid?t('通过','Passed'):t('未通过','Failed')}{t('；','; ')}{t('最终确认：','Finalization: ')}{progress.workflow?.finalization?.required?t('必须完成','Required'):t('未要求','Not required')}{t('。','.')}</p><Details title={t('编排决策：并行、Main／Codex task、人类介入','Orchestration decisions: parallelism, Main/Codex task, and human intervention')} value={progress.proposal?.planning_analysis}/><p>{t('审核通过表示转换语义通过；下列启动限制不会被自动清除。','Passing review approves the conversion semantics; the launch constraints below are not removed automatically.')}</p><Details title={t('启动条件与待确认事项','Launch conditions and items needing confirmation')} value={progress.validation?.blockers}/><h3>{t('逐项审核清单','Review checklist')}</h3><ReviewChecklist result={progress.review?.structured_output}/><Details title={t('查看完整草稿和检查证据','View the full draft and review evidence')} value={{workflow:progress.workflow,validation:progress.validation,proposal:progress.proposal,review:progress.review}}/></>}
    {['review_required','ready_to_apply'].includes(progress?.phase) && <button className="primary" disabled={busy} onClick={accept}>{t('我确认所示步骤和连线，保存为可编辑草稿','I confirm the shown steps and edges; save as an editable draft')}</button>}
    {progress?.phase==='approval' && progress.approvals.map((approval:Json)=><div key={approval.id}><Details title={t('本次调用的权限要求','Permission requirements for this call')} value={approval}/><button disabled={busy} onClick={async()=>{setBusy(true);try{await api('approve',{...control,approval_id:approval.id,decision:true});setProgress(null);}catch(cause){fail(cause);}finally{setBusy(false);}}}>{t('允许此次调用并继续','Allow this call and continue')}</button></div>)}
    {progress?.phase==='authentication_required' && <div><p>{t('此操作仅用于你主动选择的独立登录模式。完成登录后继续。','This only applies to the managed login mode you selected. Finish signing in, then continue.')}</p>{progress.live?.status==='auth_required' && <button disabled={busy} onClick={async()=>{setBusy(true);try{const value=await api('login_generation',control!);setLogin(value);setProgress({...progress,live:value});}catch(cause){fail(cause);}finally{setBusy(false);}}}>{t('获取官方登录链接','Get the official sign-in link')}</button>}{login?.auth_url && <a href={login.auth_url} target="_blank" rel="noreferrer">{t('打开官方登录页面','Open the official sign-in page')}</a>}<button onClick={()=>{setError(null);setProgress(null);}}>{t('登录完成，继续','Sign-in complete; continue')}</button></div>}
    {progress?.phase==='repairing' && <p>{t('第 ','Round ')}{progress.round}{t(' 轮：已将具体问题反馈给生成模型。', ': Specific issues were sent back to the generation model.')}</p>}
    {progress?.phase==='attention' && <Details title={t('停止原因','Reason for stopping')} value={progress}/>}
    {run && <details><summary>{t('运行详情与恢复（高级）','Run details and recovery (advanced)')}</summary><button onClick={()=>openRun(run)}>{t('查看详细运行','View detailed run')}</button>{error && <button onClick={()=>{setError(null);setProgress(null);}}>{t('重新检查此任务状态','Check this task status again')}</button>}</details>}
  </section>;
}
