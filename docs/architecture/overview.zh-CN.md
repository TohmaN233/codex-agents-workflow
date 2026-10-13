# 当前架构概览

[文档索引](../README.zh-CN.md) · [操作教程](../guides/usage.zh-CN.md) · [Workflow Schema](../reference/workflow-schema.zh-CN.md) · [English](overview.md)

Codex Agents Workflow 1.2 将语义工作与执行机制分开。Workflow 描述任务和依赖构成的图。本地 Host 校验该图，绑定已配置的执行器和资源，调度可运行的工作，并记录 Run 状态。Agent 产出任务结果；Main 负责语义判断，并在接收工作前检查证据。

## Skill、Workflow 与 Harness

Skill 提供操作指令、参考资料，有时也提供可调用的代码或工具。Workflow 将流程表达为明确的职责和依赖。转化应保留 Skill 中有用的行为及已有工具；拆成节点不能成为删减能力或增加无关工作的理由。

Harness 是模型周围的执行环境，包括工具访问、上下文准备、执行循环、状态与检查。本插件的 Host 为 Workflow 提供其中的确定性机制，Agent 仍负责语义判断。Skill 提供指导，图组织流程，Harness 执行并观察工作；它们可以共同使用。

流程变长时，单靠提示词不能隔离后续步骤，也不能阻止重复读取和机械复制。如果 Main 持续轮询，仅委派给子 Agent 仍会保留 Main 的协调开销。声明式上下文、Host 负责的绑定、事件等待和有界返修针对这些具体开销。单个有界操作直接使用 Skill 可能更简单；性能结论仍需根据实际任务测量。

## 职责划分

| 部分 | 职责 |
| --- | --- |
| Main | 接收用户目标，启动或创建 Workflow，处理语义判断，并在检查证据后接收结果。 |
| Host | 编译并校验图的执行机制，解析绑定和路径，检查声明的要求，调度节点，记录事件与结果，并根据 Run 状态恢复工作。 |
| Provider 节点 | 使用其配置的 Provider 及为该节点投影的输入和资源，完成分配给它的语义步骤。 |
| Role | 描述 Main 在普通任务中可以选择的帮手。Role 与 Workflow 分开配置，不会绑定到 Workflow 节点。 |
| Run 工作区和日志 | 保存任务产物，以及供检查、继续或恢复 Run 使用的状态。 |

工作台是本地 Codex 插件和 MCP Extension。内嵌视图使用宿主提供的 MCP Apps 与 Extensions 能力；独立浏览器控制台使用同一套本地 Host 和配置。安装、启动、设置和恢复步骤见[操作教程](../guides/usage.zh-CN.md)。

## Workflow 执行

独立的 Provider 节点和 Main worker 会话会收到已声明的输入、资源、工具、工作区访问权限和前置结果。它们不会自动获得发起聊天的对话记录、环境中的 Skill 目录或其他节点的原始对话。Main orchestration 保留发起对话，下文会说明这一执行方式。Host 会准备机械字段和结果契约，因此模型不必自行编造或复制标识符、路径、哈希、绑定和依赖记录。

独立分支或列表批次可以在配置上限内并行运行。节点把产物写入分配给它的工作区，并返回简短状态和文件引用；大段输出和日志留在磁盘上，不会通过 Agent 消息反复复制。Host 会记录各节点的尝试和结果。一个分支失败时，已完成的同级工作仍可供检查或有界返修；单个失败本身不要求重新运行所有成功分支。

交接后，Main 可以让出执行，由 Host 等待事件。默认情况下，Host 最多等待一小时；出现可处理的事件时会更早恢复，包括完成、失败、交接或需要处理的请求。Main 不必短间隔轮询 Run。等待机制不会消除子执行器所需的时间或模型工作。

## Main、Provider、Role 与 Thread

生成的独立工作默认使用已配置且可写入的 Provider 子 Agent。生成时的编排和语义验收仍由发起任务的 Main 对话负责。Main worker 会话和持久化 Codex Task 是编辑器中的明确可选项。若所需 Provider 不可用，Host 会报告阻塞原因，不会静默替换成其他执行器。

Main orchestration 节点会在启动 Workflow 的对话中继续执行，并可使用该对话现有的上下文。Main worker 是临时的新会话，使用调用方 Main 的模型，并接收已声明的节点材料。Thread 节点会在多个 Workflow 阶段继续同一个可见的 Codex task；当该 task 的对话状态必须保留时，它很有用，但不是普通独立工作的默认方式。当前对话中的 Main orchestration、新建 Main worker 和持久化 Thread 是三种不同的执行器选择。

Role 用于另一条路径：普通任务没有匹配的 Ready Workflow，且帮手能提供实质帮助时，Main 可以自动选择一个已启用的 Role。用户无需点名 Role，也不必启动 Workflow。Role 是否启用及其 Provider 都独立配置。Workflow 节点直接绑定 Provider，不会继承 Role 指令。Codex 自身的会话配置见[官方 Codex 子 Agent 指南](https://learn.chatgpt.com/docs/agent-configuration/subagents)。

## 创建与完成

Build Workflow 会把 brief 转换为可复用的图；Skill to Workflow 会把固定版本的 Skill 转换为 Workflow。Host 编译生成的语义步骤，并检查结果图及其启动要求。

当前默认采用自动完成：独立审查和 Host 检查通过后，Host 会清理临时创建产物，并发布一个已启用且可启动的 Workflow。选择手动完成会保留经过审查的草稿，等待用户接受。无论选择哪种方式，单独打开工作台都不会启动 Run。

## 边界与证据

按任务声明输入是一种上下文选择边界；它不代表操作系统级文件系统隔离。并行执行和上下文选择可能有助于聚焦工作，但不保证总成本更低、耗时更短或一定命中缓存。[实验报告](../experiments/README.zh-CN.md)记录特定历史样本及其限制，不代表普遍的性能承诺，也没有测量当前 1.2 的每一种执行路径。

操作细节见[Provider、Role、恢复与配置指南](../guides/usage.zh-CN.md)。支持的 Workflow 字段见[Schema 参考](../reference/workflow-schema.zh-CN.md)。

实现资料包括[插件清单](../../plugins/codex-agents-workflow/.codex-plugin/plugin.json)、[生成的执行器默认值](../../plugins/codex-agents-workflow/control-plane/test/authoring-executor-defaults.test.mjs)、[发布默认值](../../plugins/codex-agents-workflow/control-plane/test/release-defaults.test.mjs)和[创建完成策略](../../plugins/codex-agents-workflow/control-plane/lib/skill-import/completion-policy.mjs)。
