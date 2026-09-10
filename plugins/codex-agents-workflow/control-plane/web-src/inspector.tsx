import { Field, JsonField, ProviderField, Select, Details, useLocale, type Json } from './shared';
import { findUpstreamThreadSources, resolveThreadSource } from './thread-source-options.mjs';
export function Inspector({ workflow, selection, providers, change, select, inline }: { workflow: Json, selection: { kind: string, id: string }, providers: Json[], change: (w: Json) => void, select: (kind: string, id: string) => void, inline: () => void }) {
  const t = useLocale();
  const node = workflow.nodes.find((item: Json) => item.id === selection.id); const edge = workflow.edges.find((item: Json) => item.id === selection.id);
  const patch = (fields: Json) => change({ ...workflow, nodes: workflow.nodes.map((item: Json) => item.id === node.id ? { ...item, ...fields } : item) });
  const edgePatch = (fields: Json) => change({ ...workflow, edges: workflow.edges.map((item: Json) => item.id === edge.id ? { ...item, ...fields } : item) });
  const providerId = node?.executor?.provider_id ?? providers.find((provider: Json) => provider.enabled && provider.capabilities?.read)?.id ?? '';
  const threadSources = node ? findUpstreamThreadSources(workflow, node.id) : [];
  const sourceNodeId = node?.executor?.source_node ?? '';
  const sourceResolution = node?.executor?.kind === 'thread'
    ? resolveThreadSource(workflow, node.id, { providerId, sourceNodeId })
    : { options: [], sourceNodeId: '', providerId, needsSelection: false, ambiguous: false, noMatch: false };
  const selectedSource = threadSources.find(source => source.id === sourceNodeId);
  const sourceNeedsSelection = node?.executor?.kind === 'thread' && node.executor.lifecycle === 'continue' && !selectedSource;
  const sourceOptions = threadSources.map(source => ({
    value: source.id,
    label: `${source.id}${source.providerId ? ` · ${source.providerId}` : ''}${source.distance > 1 ? ` · ${t('上游', 'upstream')} ${source.distance} ${t('层', 'levels')}` : ''}`,
  }));
  const sourceProviderId = selectedSource?.providerId ?? node?.executor?.provider_id ?? '';
  const setThreadLifecycle = (lifecycle: string) => {
    if (lifecycle === 'continue') {
      const resolved = resolveThreadSource(workflow, node.id, { providerId, sourceNodeId });
      patch({ executor: {
        ...node.executor,
        kind: 'thread',
        lifecycle,
        source_node: resolved.sourceNodeId,
        provider_id: resolved.providerId,
      } });
      return;
    }
    patch({ executor: { kind: 'thread', provider_id: node.executor.provider_id, lifecycle } });
  };
  const setAgentExecutor = (kind: string) => {
    if (kind === 'main') patch({ executor: { kind: 'main' } });
    else if (kind === 'thread') patch({ executor: { kind: 'thread', provider_id: providerId, lifecycle: 'start' } });
    else patch({ executor: { kind: 'provider', provider_id: providerId } });
  };
  return <aside className="inspector scroll"><div className="panel-heading"><h2>{selection.kind === 'node' && node ? t('节点属性', 'Node properties') : selection.kind === 'edge' && edge ? t('连接属性', 'Connection properties') : t('Workflow 属性', 'Workflow properties')}</h2><button onClick={() => select('workflow', '')}>{t('全局', 'Global')}</button></div>
    {selection.kind === 'node' && node ? <>
      <div className="muted">{node.id} · {node.type}</div>
      <Field label={t('名称', 'Name')} value={node.name ?? node.id} onChange={name => patch({ name })}/>
      {node.type === 'agent' && <>
        <Select label={t('执行方式', 'Execution mode')} value={node.executor?.kind ?? 'main'} options={[{value:'main',label:t('Main · 主控制会话', 'Main · control session')},{value:'provider',label:t('Provider · 原生交接', 'Provider · native handoff')},{value:'thread',label:t('Codex task · 独立会话', 'Codex task · independent session')}]} onChange={setAgentExecutor}/>
        {node.executor?.kind !== 'main' && <fieldset disabled={node.executor?.kind === 'thread' && node.executor.lifecycle === 'continue'}><ProviderField providers={node.executor?.kind === 'thread' ? providers.filter((provider: Json) => provider.kind === 'native_agent') : providers} main={false} label={node.executor?.kind === 'thread' ? t('Task Provider（续聊时由来源决定）', 'Task provider (determined by source when continuing)') : t('固定 Provider', 'Fixed provider')} value={node.executor?.kind === 'thread' && node.executor.lifecycle === 'continue' ? sourceProviderId : node.executor?.provider_id ?? ''} onChange={id => patch({ executor: { ...node.executor, provider_id: id } })}/></fieldset>}
        <Field label={t('角色', 'Role')} value={node.role} onChange={role => patch({ role })}/>
        {node.executor?.kind === 'thread' && <>
          <Select label={t('Task 生命周期', 'Task lifecycle')} value={node.executor.lifecycle ?? 'start'} options={[{value:'start',label:t('创建独立 Task', 'Create independent task')},...(threadSources.length?[{value:'continue',label:t('续聊已有 Task', 'Continue existing task')}]:[])]} onChange={setThreadLifecycle}/>
          {node.executor.lifecycle === 'continue' && <div className={sourceNeedsSelection ? 'invalid-field' : undefined}>
            <Select label={t('续聊来源节点（必选）', 'Continuation source node (required)')} value={sourceNodeId} options={[{ value: '', label: t('请选择来源节点', 'Select a source node') }, ...sourceOptions]} onChange={source_node => {
              const source = threadSources.find(option => option.id === source_node);
              patch({ executor: { ...node.executor, lifecycle: 'continue', source_node, ...(source?.providerId ? { provider_id: source.providerId } : {}) } });
            }}/>
            {sourceNeedsSelection && <small role="alert">{t(`请选择一个实际的上游 Codex task 作为续聊来源；${sourceResolution.ambiguous ? '存在多个同 Provider 的候选' : '当前 Provider 没有唯一匹配来源'}。`, `Select an actual upstream Codex task as the continuation source; ${sourceResolution.ambiguous ? 'multiple candidates use the same provider' : 'the current provider has no unique matching source'}.`)}</small>}
          </div>}
        </>}
      </>}
      {node.type === 'skill_ref' && <><ProviderField label={t('固定 Provider', 'Fixed provider')} providers={providers} value={node.executor?.kind === 'main' ? '$main' : node.executor?.provider_id ?? ''} onChange={id => patch({ executor: id === '$main' ? { kind: 'main' } : { kind: 'provider', provider_id: id } })}/><Field label={t('角色', 'Role')} value={node.role} onChange={role => patch({ role })}/></>}
      {node.type === 'agent' && <Field label={t('任务指令 / 模板', 'Task instruction / template')} value={node.prompt_template} multiline onChange={prompt_template => patch({ prompt_template })}/>}
      {node.executor && <>
        <Select label={t('访问权限', 'Access')} value={typeof node.access === 'string' ? node.access : '$run'} options={[{value:'read_only',label:t('只读','Read only')},{value:'bounded_write',label:t('受限写入','Bounded write')}, ...(['main','subworkflow'].includes(node.executor.kind) ? [{ value: '$run', label: t('继承 Run 权限', 'Inherit Run access') }] : [])]} onChange={access => patch({ access: access === '$run' ? { binding: 'run.access' } : access })}/>
        <JsonField label={t('写入路径范围（非 glob；或 Run 绑定）', 'Write path scope (no glob; or Run binding)')} value={node.path_scope ?? []} onChange={path_scope => patch({ path_scope })}/>
        <label className="check"><input type="checkbox" checked={!!node.approval?.required} onChange={e => patch({ approval: { ...node.approval, required: e.target.checked } })}/>{t('执行前需批准', 'Approval required before execution')}</label>
        <Field label={t('最大尝试次数（1–10）', 'Maximum attempts (1–10)')} value={node.retry?.max_attempts} onChange={value => patch({ retry: { ...node.retry, max_attempts: Number(value) } })}/>
        <JsonField label={t('输入绑定（上游 JSON Pointer）', 'Input bindings (upstream JSON Pointer)')} value={node.input_bindings ?? {}} onChange={input_bindings => patch({ input_bindings })}/>
        <JsonField label={t('输出 Schema', 'Output schema')} value={node.outputs_schema ?? {}} onChange={outputs_schema => patch({ outputs_schema })}/>
        <JsonField label={t('资源路径', 'Resource paths')} value={node.resources ?? []} onChange={resources => patch({ resources })}/>
        <details><summary>{t('节点 Skill 策略（只可收紧）', 'Node Skill policy (tightening only)')}</summary><JsonField label={t('留空对象表示继承', 'An empty object means inherit')} value={node.skill_policy ?? {}} onChange={value => { const next = { ...node }; if (!Object.keys(value).length) delete next.skill_policy; else next.skill_policy = value; change({ ...workflow, nodes: workflow.nodes.map((n: Json) => n.id === node.id ? next : n) }); }}/></details>
      </>}
      {node.type === 'condition' && <><JsonField label={t('按顺序匹配的条件 DSL', 'Conditions DSL matched in order')} value={node.cases} onChange={cases => patch({ cases })}/><Field label={t('默认连接标签', 'Default connection label')} value={node.default_label} onChange={default_label => patch({ default_label })}/></>}
      {node.type === 'parallel' && <><Select label={t('汇合节点', 'Join node')} value={node.join_id} options={workflow.nodes.filter((n: Json) => n.type === 'join').map((n: Json) => n.id)} onChange={join_id => patch({ join_id })}/><Select label={t('分支失败策略', 'Branch failure policy')} value={node.failure_policy} options={[{value:'collect',label:t('收集所有结果','Collect all results')},{value:'fail_fast',label:t('快速失败','Fail fast')}]} onChange={failure_policy => patch({ failure_policy })}/></>}
      {node.type === 'join' && <Select label={t('对应并行节点', 'Matching parallel node')} value={node.parallel_id} options={workflow.nodes.filter((n: Json) => n.type === 'parallel').map((n: Json) => n.id)} onChange={parallel_id => patch({ parallel_id })}/>}
      {node.type === 'skill_ref' && <><JsonField label={t('SkillRef（精确路径、名称、哈希、嵌套 pin）', 'SkillRef (exact path, name, hash, nested pins)')} value={node.skill_ref} onChange={skill_ref => patch({ skill_ref })}/><button onClick={inline}>{t('将已保存的 SkillRef 转为 Inline Draft', 'Convert the saved SkillRef to an inline draft')}</button></>}
      {node.type === 'subworkflow' && <JsonField label={t('子 Workflow / revision_pin / output_bindings', 'Child workflow / revision_pin / output_bindings')} value={node.subworkflow} onChange={subworkflow => patch({ subworkflow })}/>}
      {node.type === 'tool' && <Field label={t('确切 Host Tool 名称', 'Exact host tool name')} value={node.executor.tool} onChange={tool => patch({ executor: { ...node.executor, tool } })}/>}
      {node.origin && <Details title={t('来源与审查记录', 'Origin and review record')} value={node.origin}/>}
      <button className="danger" onClick={() => { change({ ...workflow, nodes: workflow.nodes.filter((n: Json) => n.id !== node.id), edges: workflow.edges.filter((e: Json) => e.source !== node.id && e.target !== node.id) }); select('workflow', ''); }}>{t('删除节点及相关连接', 'Delete node and related connections')}</button>
    </> : selection.kind === 'edge' && edge ? <>
      <div className="muted">{edge.id}</div>
      <Select label={t('起点', 'Source')} value={edge.source} options={workflow.nodes.map((n: Json) => n.id)} onChange={source => edgePatch({ source })}/>
      <Select label={t('终点', 'Target')} value={edge.target} options={workflow.nodes.map((n: Json) => n.id)} onChange={target => edgePatch({ target })}/>
      <Field label={t('条件 / 分支标签', 'Condition / branch label')} value={edge.label} onChange={label => edgePatch({ label })}/>
      <Select label={t('前置节点结果', 'Previous node result')} value={edge.on ?? 'success'} options={[{value:'success',label:t('成功','Success')},{value:'failure',label:t('失败','Failure')},{value:'always',label:t('始终','Always')}]} onChange={on => edgePatch({ on })}/>
      {edge.origin && <Details title={t('来源', 'Origin')} value={edge.origin}/>}
      <button className="danger" onClick={() => { change({ ...workflow, edges: workflow.edges.filter((e: Json) => e.id !== edge.id) }); select('workflow',''); }}>{t('删除连接', 'Delete connection')}</button>
    </> : <>
      <Field label={t('名称', 'Name')} value={workflow.name} onChange={name => change({ ...workflow, name })}/>
      <Field label={t('说明', 'Description')} value={workflow.description} multiline onChange={description => change({ ...workflow, description })}/>
      <label className="check"><input type="checkbox" checked={workflow.enabled} onChange={e => change({ ...workflow, enabled: e.target.checked })}/>{t('允许启动此 Workflow', 'Allow this workflow to start')}</label>
      <Select label={t('隔离模式', 'Isolation mode')} value={workflow.skill_policy.mode} options={[{value:'strict',label:t('严格','Strict')},{value:'cooperative',label:t('协作','Cooperative')}]} onChange={mode => change({ ...workflow, skill_policy: { ...workflow.skill_policy, mode } })}/>
      <JsonField label={t('完整 Skill 策略', 'Complete Skill policy')} value={workflow.skill_policy} onChange={skill_policy => change({ ...workflow, skill_policy })}/>
      <Select label={t('Main 最终验收节点', 'Main finalization node')} value={workflow.finalization.node_id} options={workflow.nodes.filter((n: Json) => n.executor?.kind === 'main').map((n: Json) => n.id)} onChange={node_id => change({ ...workflow, finalization: { required: true, node_id } })}/>
      <JsonField label={t('输入 Schema', 'Input schema')} value={workflow.inputs_schema} onChange={inputs_schema => change({ ...workflow, inputs_schema })}/>
      <JsonField label={t('输出 Schema', 'Output schema')} value={workflow.outputs_schema} onChange={outputs_schema => change({ ...workflow, outputs_schema })}/>
      <JsonField label={t('外部依赖要求', 'External requirements')} value={workflow.requirements} onChange={requirements => change({ ...workflow, requirements })}/>
      <JsonField label={t('标签', 'Tags')} value={workflow.tags ?? []} onChange={tags => change({ ...workflow, tags })}/>
    </>}
  </aside>;
}
