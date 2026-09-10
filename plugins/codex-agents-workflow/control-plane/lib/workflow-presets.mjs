import { createDraft } from './workflow-schema.mjs';
import { requireValue } from './workflow-paths.mjs';
import { nativeBindingIssue } from './native-binding.mjs';

export const WORKFLOW_PRESETS = [
  {id:'collaborative-task',name:'多角色协作',description:'主会话并行管理方案与执行准备两个 Codex task；方案完成后续聊执行 task，主 Agent 验收。'},
  {id:'collaborative-image',name:'协作生图',description:'主会话并行管理提示词与图片准备两个 Codex task；提示词完成后续聊图片 task 完成生图。'},
  {id:'mathematical-research-hybrid',name:'Mathematical Research Hybrid',description:'An English example that runs independent one-off research workers in parallel, then keeps a single evolving research board only when the human confirms a persistent route.'},
];

const schema = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const text = {type:'string',minLength:1};
const edge = (source,target,label) => ({id:`${source}-${target}`,source,target,...(label?{label}:{})});
const agent = (id,name,executor,prompt,outputs_schema,write=false) => ({id,name,type:'agent',role:'implementer',executor,
  access:write?'bounded_write':'read_only',...(write?{path_scope:{binding:'run.allowed_paths'}}:{}),
  prompt_template:prompt,outputs_schema,input_bindings:{task:'/inputs/task'},approval:{required:false},retry:{max_attempts:2}});
const thread = (provider,lifecycle,source_node) => ({kind:'thread',provider_id:provider.id,lifecycle,...(source_node?{source_node}:{})});

function selectNativeProvider(providers,routingRules,route,label,{roles=['implementer','advisor'],write=false}={}) {
  const providerId=routingRules?.routes?.[route]?.provider_id;
  const provider=providers.find(item=>item.id===providerId);
  requireValue(provider?.enabled && provider.kind==='native_agent' && provider.capabilities?.read && (!write || provider.capabilities?.write) && roles.includes(provider.config?.role),
    'PRESET_PROVIDER_UNAVAILABLE',`Configure an enabled native ${label} Provider before adding this preset`,{provider_id:providerId,route,write,roles});
  const conflict=nativeBindingIssue(provider);
  requireValue(!conflict,conflict?.code,conflict?.message,conflict?{binding:conflict}:{});
  return provider;
}

function mainAgent(id,name,prompt,outputs_schema,input_bindings={task:'/inputs/task'},role='advisor') {
  const node=agent(id,name,{kind:'main'},prompt,outputs_schema);
  node.role=role;node.input_bindings=input_bindings;
  return node;
}

function providerAgent(id,name,provider,prompt,outputs_schema,{write=false,input_bindings={task:'/inputs/task'}}={}) {
  const node=agent(id,name,{kind:'provider',provider_id:provider.id},prompt,outputs_schema,write);
  node.role=provider.config.role;node.input_bindings=input_bindings;
  return node;
}

function cooperativePreset(preset,{tags,outputs_schema,output_bindings,finalization,nodes,edges,providers}) {
  return {...createDraft('builtin-'+preset.id,preset.name),status:'ready',description:preset.description,tags,
    skill_policy:{mode:'cooperative',implicit:'allow',ambient_allow:[],shadowed_skill_paths:[]},
    requirements:{providers:[...new Set(providers.map(provider=>provider.id))].sort(),tools:[],mcp_servers:[],executables:[]},
    inputs_schema:{type:'object',properties:{task:text},required:['task'],additionalProperties:true},outputs_schema,output_bindings,finalization,nodes,edges};
}

function mathematicalResearchHybrid(preset,providers,routingRules) {
  const planning=selectNativeProvider(providers,routingRules,'planning','research-planning');
  const implementation=selectNativeProvider(providers,routingRules,'implementation','research-probe');
  const complex=selectNativeProvider(providers,routingRules,'complex_implementation','persistent-research',{write:true});
  const reviewer=selectNativeProvider(providers,routingRules,'review','adversarial-review',{roles:['reviewer']});
  const problemSchema=schema({problem_card:text,success_criteria:text,known_constraints:text});
  const surveySchema=schema({findings:text,sources:text,open_questions:text});
  const probeSchema=schema({route:text,evidence:text,disproof_attempt:text});
  const boardSchema=schema({research_board:text,route_options:text,uncertainties:text});
  const decisionSchema=schema({mode:text,selected_route:text,research_board:text});
  const resultSchema=schema({recommendation:text,research_board:text,risk_register:text});
  const problemCard=mainAgent('freeze_problem_card','Freeze the problem card',
    'Turn {{task}} into a precise mathematical problem card. State definitions, hypotheses, target claim, admissible tools, success criteria, and what would count as a disproof. Do not solve the problem yet. Output problem_card, success_criteria, and known_constraints.',problemSchema);
  const surveyInputs={task:'/inputs/task',problem_card:'/nodes/freeze_problem_card/output/problem_card'};
  const literature=providerAgent('literature_map','Literature map · one-off worker',planning,
    'Independently map the relevant literature and named theorems for {{task}} using the supplied problem card. Separate established facts from conjectural analogies. Return compact findings, traceable sources, and open questions. Do not edit files or create a persistent task.',surveySchema,{input_bindings:surveyInputs});
  const toolbox=providerAgent('toolbox_map','Toolbox map · one-off worker',implementation,
    'Independently identify the most promising mathematical tools for {{task}} from the supplied problem card. For each tool, specify the exact preconditions to verify and the obstruction it can address. Return findings, sources, and open questions. Do not edit files or create a persistent task.',surveySchema,{input_bindings:surveyInputs});
  const analogy=providerAgent('analogy_bridge','Analogy bridge · one-off worker',complex,
    'Independently search for adjacent problems whose proof patterns could transfer to {{task}}. Explain the proposed bridge, every missing hypothesis, and a smallest test of the analogy. Return findings, sources, and open questions. Do not edit files or create a persistent task.',surveySchema,{input_bindings:surveyInputs});
  const counterexample=providerAgent('counterexample_hunt','Counterexample hunter · one-off worker',reviewer,
    'Act as an adversarial one-off researcher for {{task}}. Try to construct boundary cases, false generalizations, and counterexamples to the likely routes suggested by the problem card. Return findings, sources, and open questions. Remain read-only and do not create a persistent task.',surveySchema,{input_bindings:surveyInputs});
  const board=mainAgent('assemble_research_board','Assemble the research board',
    'Compare the four independent survey reports for {{task}}. Build a research board with supported routes, rejected routes, unresolved dependencies, and at most three discriminating probes. Preserve disagreement instead of averaging it away. Output research_board, route_options, and uncertainties.',boardSchema,
    {task:'/inputs/task',problem_card:'/nodes/freeze_problem_card/output/problem_card',literature:'/nodes/literature_map/output',toolbox:'/nodes/toolbox_map/output',analogy:'/nodes/analogy_bridge/output',counterexamples:'/nodes/counterexample_hunt/output'});
  const probeInputs={task:'/inputs/task',research_board:'/nodes/assemble_research_board/output/research_board'};
  const probeA=providerAgent('route_probe_a','Route probe A · one-off worker',implementation,
    'Test the first promising route in the supplied research board for {{task}}. Work toward a decisive lemma or a decisive obstruction. Return route, evidence, and disproof_attempt. Do not edit files or create a persistent task.',probeSchema,{input_bindings:probeInputs});
  const probeB=providerAgent('route_probe_b','Route probe B · one-off worker',implementation,
    'Test the second promising route in the supplied research board for {{task}}. Work toward a decisive lemma or a decisive obstruction. Return route, evidence, and disproof_attempt. Do not edit files or create a persistent task.',probeSchema,{input_bindings:probeInputs});
  const probeC=providerAgent('route_probe_c','Route probe C · one-off worker',complex,
    'Test the highest-uncertainty route in the supplied research board for {{task}}. Prefer a small calculation, construction, or reduction that can rule the route in or out. Return route, evidence, and disproof_attempt. Do not edit files or create a persistent task.',probeSchema,{input_bindings:probeInputs});
  const chooseMode=mainAgent('choose_research_mode','Choose the research mode',
    'Use the research board and all three route probes to decide whether {{task}} needs a single persistent research state or can finish as a one-shot synthesis. Set mode to exactly persistent only when one route needs iterative work over a shared evolving board; otherwise set it to one_shot. Output mode, selected_route, and the updated research_board.',decisionSchema,
    {task:'/inputs/task',research_board:'/nodes/assemble_research_board/output/research_board',probe_a:'/nodes/route_probe_a/output',probe_b:'/nodes/route_probe_b/output',probe_c:'/nodes/route_probe_c/output'});
  const persistentStart=agent('persistent_research_state','Persistent research state · start Codex task',thread(complex,'start'),
    'Continue the selected route for {{task}} as a persistent research task. Maintain a clear research board: definitions, proven lemmas, failed attempts, open obligations, and next discriminating experiment. You may inspect tools and references wherever the host exposes them. Write only task material inside this Run\'s allowed workspace. Return recommendation, research_board, and risk_register.',resultSchema,true);
  persistentStart.role=complex.config.role;persistentStart.input_bindings={task:'/inputs/task',decision:'/nodes/choose_research_mode/output'};
  const persistentContinue=agent('persistent_research_continue','Persistent research state · continue same Codex task',thread(complex,'continue','persistent_research_state'),
    'Resume the exact existing research task for {{task}}. Reconcile the previous research board with the selected route, strengthen the most promising argument, record every failed implication, and identify the next proof obligation. You may inspect tools and references wherever the host exposes them. Write only task material inside this Run\'s allowed workspace. Return recommendation, research_board, and risk_register.',resultSchema,true);
  persistentContinue.role=complex.config.role;persistentContinue.input_bindings={task:'/inputs/task',decision:'/nodes/choose_research_mode/output',previous_research:'/nodes/persistent_research_state/output'};
  const adversarial=providerAgent('adversarial_review','Adversarial review of persistent state',reviewer,
    'Review the persistent research result for {{task}}. Check each claimed implication against the problem card and seek a smallest counterexample or missing hypothesis. Do not repair the proof yourself. Return recommendation, research_board, and risk_register.',resultSchema,
    {input_bindings:{task:'/inputs/task',decision:'/nodes/choose_research_mode/output',persistent_result:'/nodes/persistent_research_continue/output'}});
  const oneShot=providerAgent('one_shot_review','One-shot synthesis and review',reviewer,
    'Produce an adversarial one-shot synthesis for {{task}} from the research board and route probes. Distinguish proved statements, plausible conjectures, and rejected paths. Do not edit files or create a persistent task. Return recommendation, research_board, and risk_register.',resultSchema,
    {input_bindings:{task:'/inputs/task',decision:'/nodes/choose_research_mode/output'}});
  const final=mainAgent('final','Main agent · accept research outcome',
    'Inspect the selected research route and its evidence for {{task}}. Accept only claims that are supported by the problem card, the research board, and the adversarial review. Clearly state remaining proof obligations. Output recommendation, research_board, and risk_register.',resultSchema,
    {task:'/inputs/task',decision:'/nodes/choose_research_mode/output',human_confirmation:'/nodes/confirm_persistent_state/output/approved'},'finalizer');
  return cooperativePreset(preset,{tags:['builtin','example','mathematics','hybrid'],outputs_schema:resultSchema,
    output_bindings:{recommendation:'/nodes/final/output/recommendation',research_board:'/nodes/final/output/research_board',risk_register:'/nodes/final/output/risk_register'},finalization:{required:true,node_id:'final'},providers:[planning,implementation,complex,reviewer],
    nodes:[{id:'start',type:'start'},problemCard,{id:'survey_fork',type:'parallel',name:'Parallel survey',join_id:'survey_join',failure_policy:'collect'},literature,toolbox,analogy,counterexample,{id:'survey_join',type:'join',name:'Survey complete',parallel_id:'survey_fork'},board,{id:'probe_fork',type:'parallel',name:'Parallel route probes',join_id:'probe_join',failure_policy:'collect'},probeA,probeB,probeC,{id:'probe_join',type:'join',name:'Route probes complete',parallel_id:'probe_fork'},chooseMode,{id:'confirm_persistent_state',type:'human_gate',name:'Confirm persistent research state',executor:{kind:'human'},access:'read_only',approval:{required:true},retry:{max_attempts:1},prompt_template:'Approve the decision to create or avoid a persistent Codex research task after reviewing the research board.'},{id:'research_mode',type:'condition',name:'Persistent or one-shot research',cases:[{label:'persistent',when:{op:'eq',args:[{path:'/nodes/choose_research_mode/output/mode'},{value:'persistent'}]}}],default_label:'one_shot'},persistentStart,persistentContinue,adversarial,oneShot,final,{id:'end',type:'end'}],
    edges:[edge('start','freeze_problem_card'),edge('freeze_problem_card','survey_fork'),edge('survey_fork','literature_map','literature'),edge('survey_fork','toolbox_map','toolbox'),edge('survey_fork','analogy_bridge','analogy'),edge('survey_fork','counterexample_hunt','counterexamples'),edge('literature_map','survey_join'),edge('toolbox_map','survey_join'),edge('analogy_bridge','survey_join'),edge('counterexample_hunt','survey_join'),edge('survey_join','assemble_research_board'),edge('assemble_research_board','probe_fork'),edge('probe_fork','route_probe_a','route-a'),edge('probe_fork','route_probe_b','route-b'),edge('probe_fork','route_probe_c','route-c'),edge('route_probe_a','probe_join'),edge('route_probe_b','probe_join'),edge('route_probe_c','probe_join'),edge('probe_join','choose_research_mode'),edge('choose_research_mode','confirm_persistent_state'),edge('confirm_persistent_state','research_mode'),edge('research_mode','persistent_research_state','persistent'),edge('persistent_research_state','persistent_research_continue'),edge('persistent_research_continue','adversarial_review'),edge('adversarial_review','final'),edge('research_mode','one_shot_review','one_shot'),edge('one_shot_review','final'),edge('final','end')]});
}

function collaborativePreset(preset,providers,routingRules) {
  const image=preset.id==='collaborative-image';
  const planningProvider=selectNativeProvider(providers,routingRules,'planning','planning');
  const productionProvider=selectNativeProvider(providers,routingRules,image?'complex_implementation':'implementation',image?'image-production':'production',{write:true});
  const proposalSchema=image?schema({prompt:text,composition:text,checks:text}):schema({plan:text,checks:text});
  const planner=agent('plan',image?'提示词负责人':'方案负责人',thread(planningProvider,'start'),
    image?'针对 {{task}} 编写可直接用于生图的完整提示词，说明构图、风格、文字内容和验收要点。检查用户提供的参考材料，保留人物或产品的身份特征。输出 prompt、composition、checks。只交付结构化方案，不调用生图工具或写文件。'
    :'针对 {{task}} 制定可执行方案和验收要点。读取相关材料，明确依赖、交付物与必要的人类决策。输出 plan、checks，供执行负责人直接使用。只交付结构化方案，不执行生产操作或写文件。',proposalSchema);
  planner.role=planningProvider.config.role;
  const preparation=agent('prepare',image?'图片负责人 · 准备':'执行负责人 · 准备',thread(productionProvider,'start'),
    image?'与提示词负责人并行工作：针对 {{task}} 检查参考图片、尺寸与输出要求，并发现宿主实际可用的生图工具。读取适用的生图技能及工具说明，确认参考图可以被工具使用。工具和输入可以位于工作区之外。若缺少依赖，先寻找已有工具，仍缺失时征询安装或连接意见。全部就绪后输出 tool、references、constraints；暂不生成图片、不写任务文件。'
    :'与方案负责人并行工作：针对 {{task}} 检查输入、参考材料及宿主可用的执行工具。工具和输入可以位于工作区之外。若缺少依赖，先寻找已有工具，仍缺失时征询安装或连接意见。全部就绪后输出 tool、references、constraints；等待方案，不执行生产操作或写任务文件。',schema({tool:text,references:text,constraints:text}));
  preparation.role=productionProvider.config.role;
  const production=agent('produce',image?'图片负责人 · 生图':'执行负责人 · 执行',thread(productionProvider,'continue','prepare'),
    image?'提示词和工具准备已完成，自动接手 {{task}}。使用 inputs.proposal 中的 prompt/composition 及 inputs.preparation，调用已确认的真实生图工具；遵循其工具说明和适用生图技能。只将任务输出保存到本次允许的写入范围。检查实际图片是否符合 checks；需要修正时编辑或重生成并复查。保留实际产物路径与工具返回证据，不把文字描述当图片。输出 artifacts 和 verification。'
    :'方案和工具准备已完成，自动接手 {{task}}。结合 inputs.proposal 与 inputs.preparation，使用宿主工具完成交付。任务写入仅限本次允许范围，工具调用与输入读取遵循宿主权限。执行方案中的检查，修复实际失败并复查。输出真实 artifacts 和 verification，不将计划或模型声明当作完成。',schema({artifacts:{type:'array',items:text,minItems:1},verification:text}),true);
  production.input_bindings={task:'/inputs/task',proposal:'/nodes/plan/output',preparation:'/nodes/prepare/output'};
  production.role=productionProvider.config.role;
  const final=agent('final','主 Agent · 验收',{kind:'main'},'检查执行结果的实际产物、验证证据及方案验收点。生图任务须查看实际图片。确认满足 {{task}} 后再接受；未满足则报告具体问题，不宣称成功。输出 artifacts 和 verification。',production.outputs_schema);
  final.role='finalizer';final.input_bindings={task:'/inputs/task',result:'/nodes/produce/output',proposal:'/nodes/plan/output'};
  return {...createDraft('builtin-'+preset.id,preset.name),status:'ready',description:preset.description,tags:['内置','协作',...(image?['生图']:[])],
    skill_policy:{mode:'cooperative',implicit:'allow',ambient_allow:[],shadowed_skill_paths:[]},
    inputs_schema:{type:'object',properties:{task:text},required:['task'],additionalProperties:true},outputs_schema:production.outputs_schema,
    output_bindings:{artifacts:'/nodes/final/output/artifacts',verification:'/nodes/final/output/verification'},
    finalization:{required:true,node_id:'final'},nodes:[{id:'start',type:'start'},{id:'fork',type:'parallel',name:'并行准备',join_id:'join',failure_policy:'fail_fast'},planner,preparation,{id:'join',type:'join',name:'准备完成 · 自动交接',parallel_id:'fork'},production,final,{id:'end',type:'end'}],
    edges:[edge('start','fork'),edge('fork','plan','方案'),edge('fork','prepare','工具与素材'),edge('plan','join'),edge('prepare','join'),edge('join','produce'),edge('produce','final'),edge('final','end')]};
}

export function createWorkflowPreset(presetId,providers,routingRules) {
  const preset=WORKFLOW_PRESETS.find(item=>item.id===presetId);
  requireValue(preset,'WORKFLOW_PRESET_MISSING','Unknown Workflow preset');
  if (presetId==='mathematical-research-hybrid') return mathematicalResearchHybrid(preset,providers,routingRules);
  return collaborativePreset(preset,providers,routingRules);
}
