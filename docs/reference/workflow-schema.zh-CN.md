# Workflow Schema 参考

[文档索引](../README.zh-CN.md) · [参考索引](README.zh-CN.md) · [English](workflow-schema.md)

本页说明影响图结构和有界返修的面向用户的 Workflow 字段。Host 仍是最终依据：Run 启动前会校验固定版本的 Workflow。

## Main 自动完成检查

可写的 Main orchestration 节点可以在现有完成契约上附加机械检查：

```json
{
  "executor": { "kind": "main", "mode": "orchestration" },
  "access": "bounded_write",
  "completion_contract": {
    "on_missing": "block",
    "outcome": "decision",
    "fail_on_false": ["accepted"],
    "host_check": { "tool": "final-check", "success_field": "verified" }
  }
}
```

`tool` 指固定 Workflow 的 `host_tools` 中精确注册的契约名称；`success_field` 指该工具输出 Schema 中必需的布尔字段。可写的临时 Main worker 和 Cooperative 原生子 Agent 也支持此检查，并要求通过 `correction_field` 指定工具输出中必需的字符串。其他 Provider、持久线程和只读节点不能声明此检查。工具必需的输入字段是 `inputs` 和 `output`：它们的 Schema 必须接受节点投影后的绑定和已声明的语义输出。对于 Schema 未知的绑定，对应工具输入必须不设限制；更窄的消费者需要有机械可验证的兼容性。节点和工具的静态写权限必须有交集；启动时会在任何模型工作开始前检查其有效 Run 授权范围。

发起任务的对话会在任务包和交接内容中收到简短的检查摘要，然后通过 `workflow_orchestration_complete` 提交新生成的语义结果。Host 会在产生副作用前校验语义输出和最终验收，再调用现有且符合条件的 Host Tool Runner，并提供该检查固定的资源和已验证的运行环境。随后 Host 会检查工作区副作用和必需产物，包括检查本身生成的产物。缺少产物、检查结果为 false、命令失败、身份过期、取消和范围违规都会明确阻止验收。不会启动额外的 Main 会话。

可选的 `host_check.input_bindings` 使用与节点输入相同的有界绑定选择器。它将机械完成数据单独绑定：模型只看到节点的语义输入，而检查会收到 `{inputs: resolveBindings(host_check.input_bindings, authoritativeRunContext), output}`。图校验时会同时校验其中的指针、Schema 和依赖顺序，并在模型交接前检查实际值。未使用此映射时，现有的 `{inputs: envelope.inputs, output}` 契约保持不变。完成意图和回执会固定精确的 Host 输入摘要；模型可见的投影不能替代它。映射本身不会进入模型提示词或交接摘要。

每次尝试都会持久固定检查的精确输入摘要、有界回执/输出，以及整个工作区的内容快照，其中包括 Git 元数据和目录结构。使用相同语义输出重复提交完成结果时，只有在所有快照条目均未变化的情况下才会复用成功回执。范围内产物发生变化，或后来创建了此前缺失的产物，都会使旧检查失效；最终验收也会在其事务中独立检查新鲜度。无法读取的文件、符号链接和快照大小限制都会明确报错。语义输出变化会与输入固定值冲突。意图状态不确定时必须显式协调，绝不会自动重放，即使相关工具原本标记为安全也一样。没有 `host_check` 的节点仍使用普通 orchestration 完成流程。

对于 Main worker，Host 会在校验其声明的语义结果后执行检查。若检查结果为 false，Host 会将完整的 `correction_field` 诊断发回同一个临时会话，要求它提交新结果；不会启动新的 worker，也不会重新运行已接受的同级节点。`retry.max_attempts` 限制预留的模型回合数（1–10）；来源专属的写作或组件预算各自独立。每项检查都使用精确的条目/回合执行槽位、输入固定值、回执和新鲜度快照。Fan-out 检查绑定由 Host 解析，并把指定条目投影到 worker 隔离的 cwd。机械清单和可执行资源无需进入模型上下文。检查抛出异常或返修预算耗尽都会明确失败。用量统计包括每个已分发回合；传输层缺失的用量会明确标记为未知，任何已观察到的小计都会标为部分统计。详见[按日期记录的机制与资格说明](../experiments/evidence/worker-host-completion-20261008.md)。

Cooperative 原生子 Agent 在接受条目之前也会执行相同的合格检查。槽位绑定精确观察到的子 Agent 和终止回合；结果为 false 时使用已有的子 Agent 后续跟进，最终 join 则校验已接受同级节点的回执和新鲜度。如果传输层无法确认用量总数，Host 日志中的原生用量仍为未知；实验必须在 Workflow 外归属每一条精确的子 Agent 响应。`fanout.workspace_field` 选择检查器的 cwd 和缩小后的 Host 授权范围；它不会控制原生 spawn API 的 cwd，也不会施加操作系统级文件系统隔离。

## 原生上游上下文

`executor: {"kind":"provider", "provider_id":"native-sol", "context_inheritance":"upstream"}` 会为 Cooperative 原生子 Agent 明确请求继承发起 Main 的历史记录。省略此字段或设置为 `fresh` 都保留现有的新节点上下文。Host 会生成 `fork_turns:"all"`，并省略模型/推理强度覆盖，因为原生 API 会连同完整历史一起继承这些设置。分发前会对实际发起 Main 的选择进行认证和绑定。Strict 或 managed-native 执行必须拒绝不受支持的继承请求。上下文继承共享父任务现有前缀；它不承诺精确的后端检查点、更低的输入计费或缓存命中。将共同的语义参考留在上游一次，子任务包只包含分配给该子任务的工作。详见[按日期记录的上下文说明](../experiments/evidence/native-upstream-context-20261008.md)。

## 在选定节点声明可执行依赖

Workflow 级别的 `requirements.executables` 仍是无条件启动契约。可执行节点（`agent`、`tool`、`skill_ref` 或 `subworkflow`）可以声明仅在该节点就绪时才需要的依赖：

```json
{
  "id": "export_mp4",
  "runtime_requirements": {
    "executables": [{ "name": "node", "version": ">=22" }, "ffmpeg", "chrome"],
    "source_requirement_ids": ["source_mp4_node", "source_mp4_ffmpeg", "source_mp4_chrome"]
  }
}
```

`executables` 是非空数组，使用现有的逻辑名称/版本/Python 模块描述符。`source_requirement_ids` 是可选数组，包含唯一且稳定的来源 ID。未知字段、命令、路径和冲突的版本范围都会导致校验失败。此声明应放在实际的独占消费者节点上；如果放在共享 router 或一般的视频处理步骤中，每个到达该步骤的请求都会受到这些依赖约束。因此，全局 Node 20 最低版本可以与 Node 22 的 MP4 导出要求并存，普通 HTML 请求则无需 FFmpeg 或 Chrome。

在认领和分发节点之前，Host 会使用现有的发现、注册表和验证机制，准备全局要求与所选节点要求的交集。缺少依赖时，Host 会在执行器启动前持久记录需处理事项，并标出节点、来源 ID 和范围哈希。注册依赖并执行 `recheck_runtime_environment` 会恢复该节点请求的范围。安装仍需人工批准；无需增加模型可用性检查节点。Run 日志会为各节点分别保存已验证路径和代次。认领记录会固定精确的范围和可执行文件路径摘要；在已准入的尝试期间修改这些路径，会在分发前明确失败。全局重新检查会保留这些绑定。新建的 Main worker、受管理的原生和 Strict 会话，以及原生 Host 资源程序代理都会收到该范围的进程环境。它们共享的 PATH 构造会为可执行目录排序，使原生逻辑名称解析与每个可解析绑定保持一致；目录顺序不兼容或工作目录遮蔽会在分发前以 `ENVIRONMENT_BINDING_STALE` 明确失败。诸如 `chrome` 绑定到 `google-chrome` 这样的物理别名会保留其绝对程序绑定，不会臆造 PATH 别名。当前 Main orchestration 和 Cooperative 原生子任务会收到权威范围内的工具位置，但 Host 无法更改它们现有的进程环境或任意 shell 解析方式。这种原生环境转发不会增加 WSL 环境支持；不兼容的显式 WSL 环境会明确失败。

条件来源编译还要求显式映射 `runtime_activation: {"condition_node_id":"export_route","branch_label":"导出 MP4"}`。Host 会验证原始分支边、来源可执行文件/版本/模块证据，并确认条件节点支配所有映射的消费者，同时其他分支均无法到达这些消费者。只有通过这些检查，Host 才会生成节点声明并将条件依赖标记为已编译。现有的文字守卫、共享消费者和仅产物阶段仍会明确标记为由 Agent 辅助，并说明准备未绑定的原因。当前语义规划器 ABI 不会推断此类型化激活；作者可以提供规范映射，或经过审查的显式节点声明。可移植依赖细节和来源阶段会保留在转换导出中；本地路径和探测证据仍属于 Host 状态。

## 有界返修循环

使用 Workflow 级别的 `loops` 数组声明重复的审查和返修。循环命名现有节点图中的一个区域；它不会增加回边。图仍保持 DAG，只有指定区域会重复执行。

在工作台中，打开画布检查器里的 **Workflow properties**，并使用 **Repair loops** 添加区域。选择入口节点、出口节点、成员节点和轮数上限。画布会勾勒该区域并显示轮数标记。可使用简单布尔 JSON Pointer 定义停止条件；高级 JSON 字段还支持现有条件 DSL 和反馈绑定映射。条目级范围提供条目选择器和路径字段，必要时也可使用高级选择器 JSON。

```json
{
  "loops": [
    {
      "id": "review-repair",
      "entry_node": "route",
      "exit_node": "review",
      "node_ids": ["route", "repair", "review"],
      "max_rounds": 4,
      "until": {
        "op": "eq",
        "args": [
          { "path": "/loops/review-repair/all_accepted" },
          { "value": true }
        ]
      },
      "feedback_bindings": {
        "findings": "/nodes/review/output/verdicts"
      },
      "item_scope": {
        "items": "/inputs/items",
        "verdicts": "/nodes/review/output/verdicts",
        "paths_field": "files",
        "dependencies_field": "dependencies"
      }
    }
  ]
}
```

每个条目包含以下字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 此区域稳定且唯一的标识符。 |
| `entry_node` | 每一轮进入该区域的节点。 |
| `exit_node` | Host 评估接受或重复本轮的边界。Agent 和 SkillRef 出口使用独立审查上下文；访问权限由 Run 授权范围单独约束。条件出口会保留其选定分支。接受条目需要执行过审查，并明确声明访问权限。应在结构化结果中表达语义拒绝；语义判断为 false 不等同于执行失败。 |
| `node_ids` | 此区域中显式包含的节点。入口节点和出口节点都属于此区域。 |
| `max_rounds` | 正数轮数上限，包括第一次审查。这是每个区域的返修上限，与节点本地重试预算分开。 |
| `until` | 使用现有 Workflow 条件表达式 DSL 的布尔条件。条件为 true 时，循环可以离开其区域。循环上下文会通过 `/loops/<id>/...` 暴露 `feedback` 和 `all_accepted` 值。 |
| `feedback_bindings` | 可选的命名选择器，存储在 `/loops/<id>/feedback/<name>` 下。返修节点通过输入绑定读取这些值。选择器使用现有 JSON Pointer 或有界选择器形式。 |
| `item_scope` | 可选的条目级审查与返修契约，详见下文。 |

声明 `item_scope` 后，第一次审查会收到所有范围内条目，第一次返修输入为空。后续轮次只会将失败的原始条目及其最新发现交给返修。Host 保持原始条目记录不可变；每轮返修输入都会附上该轮投影的发现。已接受条目保留在历史记录中。审查会覆盖失败条目，以及依赖的共享文件发生变化的已接受条目。Host 只会让受这些变化影响的验收失效，避免不必要地重写已经正确的条目。

`item_scope.items` 和 `item_scope.verdicts` 使用与 Workflow 输入绑定相同的选择器形式。`paths_field` 指定每个原始条目中一个数组字段，该字段列出它的产物路径。`dependencies_field` 是可选字段，用于指定另一个包含依赖路径的数组。Host 利用这些关系，判断共享文件变化后哪些已接受条目需要再次审查。

当审查器对 `review_items` 执行 fan-out 时，其来源列表必须非空。Host 会在启动前检查已知输入，并在区域激活时、分发审查器之前检查生成的输入。

Run 视图会显示每个区域的状态和轮数，并允许查看存储的循环状态。如果循环达到 `max_rounds` 时仍未验收，Run 将失败。Host 绝不会接受耗尽轮次后的未经审查结果。循环轮数不是整个 Run 的硬性总上限；普通节点重试和互相独立的区域仍使用各自的上限。
