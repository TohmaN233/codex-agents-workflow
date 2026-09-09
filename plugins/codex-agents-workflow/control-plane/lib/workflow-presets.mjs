import { createDraft } from './workflow-schema.mjs';
import { requireValue } from './workflow-paths.mjs';
import { nativeBindingIssue } from './native-binding.mjs';

export const WORKFLOW_PRESETS = [
  {id:'collaborative-task',name:'多角色协作',description:'方案负责人和执行负责人并行准备，方案完成后自动交接执行，主 Agent 验收。'},
  {id:'collaborative-image',name:'协作生图',description:'提示词负责人编写提示词，图片负责人同步检查参考图和生图工具；就绪后自动接手生图。'},
];
const schema = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const text = {type:'string',minLength:1};
const edge = (source,target,label) => ({id:`${source}-${target}`,source,target,...(label?{label}:{})});
const agent = (id,name,executor,prompt,outputs_schema,write=false) => ({id,name,type:'agent',role:'implementer',executor,
  access:write?'bounded_write':'read_only',...(write?{path_scope:{binding:'run.allowed_paths'}}:{}),
  prompt_template:prompt,outputs_schema,input_bindings:{task:'/inputs/task'},approval:{required:false},retry:{max_attempts:2}});

export function createWorkflowPreset(presetId, providers, routingRules) {
  const preset=WORKFLOW_PRESETS.find(p=>p.id===presetId);
  requireValue(preset,'WORKFLOW_PRESET_MISSING','Unknown Workflow preset');
  const providerId=routingRules.routes.planning.provider_id;
  const provider=providers.find(p=>p.id===providerId);
  requireValue(provider?.enabled && provider.kind==='native_agent' && provider.capabilities?.read && ['implementer','advisor'].includes(provider.config?.role),
    'PRESET_PROVIDER_UNAVAILABLE','Configure an enabled native planning Provider before adding this preset',{provider_id:providerId});
  const conflict=nativeBindingIssue(provider);
  requireValue(!conflict,conflict?.code,conflict?.message,conflict?{binding:conflict}:{});
  const image=presetId==='collaborative-image';
  const proposalSchema=image?schema({prompt:text,composition:text,checks:text}):schema({plan:text,checks:text});
  const planner=agent('plan',image?'提示词负责人':'方案负责人',{kind:'provider',provider_id:provider.id},
    image?'针对 {{task}} 编写可直接用于生图的完整提示词，说明构图、风格、文字内容和验收要点。检查用户提供的参考材料，保留人物或产品的身份特征。输出 prompt、composition、checks。只交付结构化方案，不调用生图工具或写文件。'
    :'针对 {{task}} 制定可执行方案和验收要点。读取相关材料，明确依赖、交付物与必要的人类决策。输出 plan、checks，供执行负责人直接使用。只交付结构化方案，不执行生产操作或写文件。',proposalSchema);
  planner.role=provider.config.role;
  const preparation=agent('prepare',image?'图片负责人 · 准备':'执行负责人 · 准备',{kind:'main'},
    image?'与提示词负责人并行工作：针对 {{task}} 检查参考图片、尺寸与输出要求，并发现宿主实际可用的生图工具。读取适用的生图技能及工具说明，确认参考图可以被工具使用。工具和输入可以位于工作区之外。若缺少依赖，先寻找已有工具，仍缺失时征询安装或连接意见。全部就绪后输出 tool、references、constraints；暂不生成图片、不写任务文件。'
    :'与方案负责人并行工作：针对 {{task}} 检查输入、参考材料及宿主可用的执行工具。工具和输入可以位于工作区之外。若缺少依赖，先寻找已有工具，仍缺失时征询安装或连接意见。全部就绪后输出 tool、references、constraints；等待方案，不执行生产操作或写任务文件。',schema({tool:text,references:text,constraints:text}));
  const production=agent('produce',image?'图片负责人 · 生图':'执行负责人 · 执行',{kind:'main'},
    image?'提示词和工具准备已完成，自动接手 {{task}}。使用 inputs.proposal 中的 prompt/composition 及 inputs.preparation，调用已确认的真实生图工具；遵循其工具说明和适用生图技能。只将任务输出保存到本次允许的写入范围。检查实际图片是否符合 checks；需要修正时编辑或重生成并复查。保留实际产物路径与工具返回证据，不把文字描述当图片。输出 artifacts 和 verification。'
    :'方案和工具准备已完成，自动接手 {{task}}。结合 inputs.proposal 与 inputs.preparation，使用宿主工具完成交付。任务写入仅限本次允许范围，工具调用与输入读取遵循宿主权限。执行方案中的检查，修复实际失败并复查。输出真实 artifacts 和 verification，不将计划或模型声明当作完成。',schema({artifacts:{type:'array',items:text,minItems:1},verification:text}),true);
  production.input_bindings={task:'/inputs/task',proposal:'/nodes/plan/output',preparation:'/nodes/prepare/output'};
  const final=agent('final','主 Agent · 验收',{kind:'main'},'检查执行结果的实际产物、验证证据及方案验收点。生图任务须查看实际图片。确认满足 {{task}} 后再接受；未满足则报告具体问题，不宣称成功。输出 artifacts 和 verification。',production.outputs_schema);
  final.role='finalizer';final.input_bindings={task:'/inputs/task',result:'/nodes/produce/output',proposal:'/nodes/plan/output'};
  return {...createDraft('builtin-'+preset.id,preset.name),status:'ready',description:preset.description,tags:['内置','协作',...(image?['生图']:[])],
    skill_policy:{mode:'cooperative',implicit:'allow',ambient_allow:[],shadowed_skill_paths:[]},
    inputs_schema:{type:'object',properties:{task:text},required:['task'],additionalProperties:true},outputs_schema:production.outputs_schema,
    output_bindings:{artifacts:'/nodes/final/output/artifacts',verification:'/nodes/final/output/verification'},
    finalization:{required:true,node_id:'final'},
    nodes:[{id:'start',type:'start'},{id:'fork',type:'parallel',name:'并行准备',join_id:'join',failure_policy:'fail_fast'},planner,preparation,
      {id:'join',type:'join',name:'准备完成 · 自动交接',parallel_id:'fork'},production,final,{id:'end',type:'end'}],
    edges:[edge('start','fork'),edge('fork','plan','方案'),edge('fork','prepare','工具与素材'),edge('plan','join'),edge('prepare','join'),edge('join','produce'),edge('produce','final'),edge('final','end')]};
}
