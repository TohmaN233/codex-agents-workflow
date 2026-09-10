import { useEffect, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, applyNodeChanges, applyEdgeChanges, useReactFlow, type NodeProps } from '@xyflow/react';
import { toCanvas, moveNode, removeElements, connectNodes, layoutGraph } from './graph-adapter.mjs';
import { Json, Status, uid, useLocale } from './shared';
import { t as translate } from '../web/i18n.js';
export const nodeKinds = ['agent', 'condition', 'parallel', 'join', 'skill_ref', 'subworkflow', 'tool', 'human_gate', 'start', 'end'];
const nodeKindLabels: Record<string, [string, string]> = { agent: ['Agent', 'Agent'], condition: ['条件', 'Condition'], parallel: ['并行', 'Parallel'], join: ['汇合', 'Join'], skill_ref: ['Skill 引用', 'Skill ref'], subworkflow: ['子 Workflow', 'Subworkflow'], tool: ['工具', 'Tool'], human_gate: ['人工确认', 'Human gate'], start: ['开始', 'Start'], end: ['结束', 'End'] };
function nodeKindLabel(type: string, localize: (zh: string, en: string) => string = translate) {
  const pair = nodeKindLabels[type]; return pair ? localize(pair[0], pair[1]) : type;
}
export function newNode(type: string, id = uid(type)): Json {
  const base: Json = { id, type, name: nodeKindLabel(type) };
  if (['agent', 'skill_ref', 'subworkflow', 'tool', 'human_gate'].includes(type)) Object.assign(base, { role: 'implementer', executor: { kind: 'main' }, access: 'read_only', path_scope: [], approval: { required: false }, retry: { max_attempts: 1 }, input_bindings: {}, resources: [] });
  if (type === 'agent') base.prompt_template = translate('说明该节点的任务、产物和验证要求。', 'Describe this node\'s task, artifacts, and verification requirements.');
  if (type === 'skill_ref') base.skill_ref = { path: '', name: '', source_hash: '', allowed_nested_skills: [] };
  if (type === 'subworkflow') { base.executor = { kind: 'subworkflow' }; base.subworkflow = { workflow_id: '', revision_pin: '', output_bindings: {} }; }
  if (type === 'tool') base.executor = { kind: 'tool', tool: '' };
  if (type === 'human_gate') base.executor = { kind: 'human' };
  if (type === 'condition') { base.cases = [{ label: 'yes', when: { op: 'eq', args: [{ path: '/inputs/choice' }, { value: true }] } }]; base.default_label = 'no'; }
  if (type === 'parallel') { base.join_id = ''; base.failure_policy = 'collect'; }
  if (type === 'join') base.parallel_id = '';
  return base;
}
function WorkflowNode({ data, selected }: NodeProps) {
  const t = useLocale();
  const node = data.definition as Json;
  const kind = nodeKindLabel(node.type, t);
  const executorKind = ({main:t('Main','Main'),provider:t('Provider','Provider'),thread:t('Codex task','Codex task'),human:t('人工','Human'),tool:t('工具','Tool'),subworkflow:t('子 Workflow','Subworkflow')} as Record<string,string>)[node.executor?.kind] ?? node.executor?.kind;
  return <div className={'flow-node ' + (selected ? 'selected' : '')} title={node.id}>
    {node.type !== 'start' && <Handle type="target" position={Position.Left}/>}
    <span className="node-kind">{kind}</span><strong>{node.name || node.id}</strong>
    <span className="node-binding">{node.executor?.kind === 'thread' ? `${t('Codex task','Codex task')} · ${node.executor.provider_id}` : node.executor?.provider_id ?? executorKind ?? node.id}</span>
    {data.status != null && <Status value={String(data.status)}/>}
    {node.type !== 'end' && <Handle type="source" position={Position.Right}/>}
  </div>;
}
const nodeTypes = { workflow: WorkflowNode };
function Surface({ workflow, onChange, onSelect, runtime, readOnly = false }: { workflow: Json, onChange: (w: Json) => void, onSelect: (kind: string, id: string) => void, runtime?: Json, readOnly?: boolean }) {
  const t = useLocale();
  const initial = toCanvas(workflow, runtime); const [nodes, setNodes] = useState<any[]>(initial.nodes); const [edges, setEdges] = useState<any[]>(initial.edges); const flow = useReactFlow();
  useEffect(() => { const graph = toCanvas(workflow, runtime); setNodes(graph.nodes); setEdges(graph.edges); }, [workflow, runtime]);
  const displayEdges = edges.map(edge => {
    const definition = edge.data?.definition;
    const label = definition ? [definition.label, definition.on && definition.on !== 'success' ? ({ failure: t('失败', 'Failure'), always: t('始终', 'Always') } as Record<string, string>)[definition.on] ?? definition.on : ''].filter(Boolean).join(' · ') : edge.label;
    return { ...edge, label };
  });
  return <div className="canvas" onDragOver={e => { if (!readOnly) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }} onDrop={e => {
    if (readOnly) return; e.preventDefault(); const kind = e.dataTransfer.getData('application/sol-node'); if (!nodeKinds.includes(kind)) return;
    const node = newNode(kind); node.ui = { position: flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }) }; onChange({ ...workflow, nodes: [...workflow.nodes, node] }); onSelect('node', node.id);
  }}>
    <ReactFlow nodes={nodes} edges={displayEdges} nodeTypes={nodeTypes} fitView minZoom={0.15} maxZoom={2}
      ariaLabelConfig={{ 'controls.ariaLabel': t('画布控件', 'Canvas controls'), 'controls.zoomIn.ariaLabel': t('放大', 'Zoom in'), 'controls.zoomOut.ariaLabel': t('缩小', 'Zoom out'), 'controls.fitView.ariaLabel': t('适应画布', 'Fit view'), 'controls.interactive.ariaLabel': t('切换交互模式', 'Toggle interaction mode'), 'minimap.ariaLabel': t('画布缩略图', 'Canvas minimap'), 'handle.ariaLabel': t('连接点', 'Connection point'), 'node.a11yDescription.default': t('工作流节点', 'Workflow node'), 'edge.a11yDescription.default': t('工作流连接', 'Workflow edge') }}
      nodesDraggable={!readOnly} nodesConnectable={!readOnly} deleteKeyCode={null}
      onNodesChange={changes => setNodes(current => applyNodeChanges(changes, current))}
      onEdgesChange={changes => setEdges(current => applyEdgeChanges(changes, current))}
      onNodeDragStop={(_, node) => { if (!readOnly) onChange(moveNode(workflow, node.id, node.position)); }}
      onNodeClick={(_, node) => onSelect('node', node.id)} onEdgeClick={(_, edge) => onSelect('edge', edge.id)} onPaneClick={() => onSelect('workflow', '')}
      onConnect={connection => { if (!readOnly && connection.source && connection.target) onChange(connectNodes(workflow, connection.source, connection.target, uid('edge'))); }}>
      <Background gap={24}/><Controls showInteractive={false} aria-label={t('画布控件', 'Canvas controls')}/><MiniMap ariaLabel={t('画布缩略图', 'Canvas minimap')} pannable zoomable nodeColor="#73674b"/>
    </ReactFlow>
    {!readOnly && <button className="canvas-layout" onClick={() => { onChange(layoutGraph(workflow)); requestAnimationFrame(() => flow.fitView()); }}>{t('自动排列并记入草稿', 'Auto-layout and save to draft')}</button>}
  </div>;
}
export function Canvas(props: Parameters<typeof Surface>[0]) { return <ReactFlowProvider><Surface {...props}/></ReactFlowProvider>; }
export { removeElements };
