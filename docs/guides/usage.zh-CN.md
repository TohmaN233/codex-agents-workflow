# Codex Agents Workflow 操作教程

[文档索引](../README.zh-CN.md) · [返回 README](../../README.zh-CN.md) · [English guide](usage.md)

本教程对应 1.2 工作台，介绍内置 Workflow、Provider 与 Role 设置、可选安装包、任务运行和恢复。

## 1. 安装并打开工作台

按照 [README 安装步骤](../../README.zh-CN.md#安装)安装插件。添加或更新插件后，使用 Codex 宿主提供的插件目录重新加载或连接刷新功能，再重新打开内嵌工作台。只有相关刷新方式不可用或已证明确实无效时才重启 Codex。

从插件入口打开工作台，也可以在当前 Codex task 中直接说：

```text
使用 $codex-agents-workflow:workflow-control-plane，在 Codex 内打开工作台。
```

工作台和 Provider 设置是 MCP App 页面。打开页面不会启动 Workflow，也不需要新建 task。宿主支持 composer mentions 时，可以引用 Workflow 或 Role；引用只提供上下文，不授权执行。内嵌能力按宿主实际提供的功能启用。

内嵌页面无需手动启动 HTTP 服务、填写端口或复制认证地址。需要独立浏览器页面，或宿主不支持内嵌页面时，可以从克隆目录启动控制台：

```powershell
.\plugins\codex-agents-workflow\scripts\open-control-console.cmd
```

```sh
sh plugins/codex-agents-workflow/scripts/open-control-console.sh
```

Windows 启动器根据 Codex 已安装插件记录启动；macOS/Linux 脚本从当前克隆目录启动。保持终端进程运行，不要分享其中带 token 的本机地址。

全新流程库只包含 **Build Workflow** 与 **Skill to Workflow**。Role 会单独显示。

新安装直接创建 v7 配置和 Workflow 存储，当前内置 Role 定义与用户配置分开维护。已有旧配置保留明确的升级与恢复路径；新安装无需先经过 v6 迁移。

![当前流程库](../assets/tutorial/workbench-library.png)

## 2. 理解 Provider、Role 与 Workflow

| 对象 | 作用 | 是否创建 Run |
| --- | --- | --- |
| Provider | 配置模型或其他执行连接 | 否 |
| Role | 定义 Main 在普通任务中如何委派一个帮手 | 否 |
| Workflow | 定义包含步骤、依赖和完成条件的任务图 | 是 |

当具体请求没有匹配的 Ready Workflow，且确实适合委派时，Main 可以自动选择已启用的 Role。用户不需要点名 Role，也不需要启动 Workflow。这种自动选择 Role 的行为与运行 Workflow 分开：Workflow 节点直接绑定 Provider，不会注入工作台 Role 的指令。

发布默认配置：

- 原生 Codex Provider 已启用；外部 Provider 已关闭。
- 全新安装默认启用 Strict；首次需要本地执行器时，Host 自动发现、注册并计算摘要。已有明确设置保留，cooperative 路线无需额外开启 Strict。
- Cross-review 与 GPT reviewer Role 会显示但默认关闭；使用时还要分别启用对应 Provider。
- Build Workflow 与 Skill to Workflow 是仅有的内置 Workflow。
- 可选安装包统一从独立的 [Workflow Package 仓库](https://github.com/TohmaN233/workflow-package)安装。

关闭的 Provider 不会被静默替换。依赖该 Provider 的 Workflow 可以安装或编辑，但在 Provider 可用前不能启动。

## 3. 配置 Provider 与 Role

从工作台导航或插件设置入口打开 **Provider 设置**。

### 原生 Provider

原生 Provider 使用当前 Codex 登录可用的模型目录。选择模型后，界面只列出该模型支持的推理强度。Main 使用启动聊天当前的模型与思考强度；从独立工作台启动时沿用 Codex 设置。

当前 authoring 预设按任务难度分工：

| 预设 | 适用工作 |
| --- | --- |
| GPT-6 Luna / Max | 普通常规检查、文档和边界明确的实现 |
| GPT-6.1 Sol / High | 复杂实现、跨模块分析和独立审查 |
| GPT-6 Astra / Medium | 困难规划、新的因果诊断和未解决的设计取舍 |

这些 Provider 路由可以编辑。只读扫描或普通审计本身不需要规划模型。生成的独立 worker 默认使用 Provider 子 Agent，并获得本次任务范围内的写权限；实际会话中的判断与协调使用 Main（orchestration）。Main worker 和持久 Thread 是你在编辑器中选择的可选项。

### 外部 Provider

外部 Provider 默认关闭。需要时再启用，并配置端点、模型和认证方式。会话 API key 使用单独的输入位置，不作为普通配置字段保存。保存设置不会调用模型。

GPT reviewer 使用已有的 `chatgpt-web-pro` Provider；Cross-review 使用 `grok-local`。使用前分别启用 Role 和对应 Provider。

### 编辑 Role

在流程库中点击 Role 卡片，可修改是否启用、Provider 绑定、访问权限和行为说明。模型与推理强度在 Provider 中配置。Role 用于 Main 在普通任务中委派帮手；Workflow 节点使用各自的 Provider、任务、输入和权限。

## 4. 从 brief 创建 Workflow

打开 **Build Workflow**，选择 **新建任务**，描述希望复用的流程，而不是某一次运行的临时答案。说明目标和产物、必须遵守的顺序、真正独立的工作、需要人工确认的位置、所需文件或工具，以及完成条件和失败后的恢复点。

authoring 会返回语义步骤；Host 负责组装任务图并检查绑定、依赖和启动条件。

默认情况下，authoring 只有在独立审核与 Host 检查确认 Workflow 已具备启动条件后才会完成。Host 清理临时 authoring 产物、发布并启用 Workflow，然后在画布中打开完整图。若希望自己确认，可在开始前勾选 **生成后保留审核草稿，等待我确认**；审核完成的结果会保留为可编辑草稿，等待你接受。

仅仅结构有效、但仍有启动或清理阻塞的图，不会被视为已完成的可启动结果。

### 多语言文档

文档任务应明确具体语言及主稿语言。例如：

```text
创建一个文档 Workflow，以英文为主稿，并提供中文和日文版本。
检查主稿，翻译成另外两种语言，最后确认每份请求的文档都有这三种语言版本。
各版本保留相同的命令、标识符、数字和作者链接。
```

输出语言属于本次任务或 Workflow 的输入 Schema；工作台的界面语言选择器不会决定产物语言。单语任务应跳过翻译。如果只给语言数量，应先确定具体语言再开始写作。

## 5. 把 Skill 转成 Workflow

在流程库选择 **从 Skill 导入**：

1. 扫描默认 Codex Skill 目录，或选择包含目标 Skill 的文件夹。
2. 核对名称、位置和来源版本，选择 **导入此版本**。
3. 打开 **导入审查**，查看固定的来源版本、资源、依赖和转换状态。
4. 启动 authoring，再从完整画布检查生成的节点、连线、人工确认点和来源要求映射。
5. 根据来源 Skill 的规则和实际运行环境复核结果。

此流程使用上一节说明的默认可启动验收策略。想自行审查并接受草稿时，请在开始前选择保留审核草稿。

重点检查：硬性规则和验收条件是否保留；只有独立工作才并行；前置结果是否传给正确节点；外部影响发生前是否有确认；任务需要的工具和权限是否可用；本机绝对路径是否改为 Run 输入或可移植依赖。

导入不会修改来源 Skill，也不会执行其业务任务。发布生成的 Workflow 也不会启动一次 Run。

## 6. 安装可选 Workflow

[Workflow Package 仓库](https://github.com/TohmaN233/workflow-package)提供通用安装包，目前有 Answer me with HTML 和 GitHub README generator；说明和样例统一放在其 `workflow_explanations/` 目录。在工作台中选择 **安装 Workflow**，然后选择 `*.workflow-package.json` 文件。安装会检查格式、内容哈希、兼容性和依赖声明，但不会安装缺失的软件。

安装后不能启动时，检查所声明的本机工具、节点 Provider、所需的 Role 与 Provider，以及本次 Run 的输入。部分示例包引用 Cross-review：Role 关闭时仍可安装，但启动前需要同时启用 Role 和可用 Provider。

- **完整 Pack 快照**保存完整编辑器修订和资源，适合审计与排障，也可能含有私有转换素材。
- **可安装包**包含兼容性、依赖和完整性清单，并排除私有来源材料，适合安装到另一台电脑。

## 7. 编辑、发布与运行

打开 Workflow 后会显示当前画布：

![当前 Workflow 画布](../assets/tutorial/workbench-editor.png)

从左侧添加节点，在画布中编辑连线，并在右侧修改 Workflow 或节点属性。顶部标签可以查看资源、导入审查、版本、完整 IR 和 Run 设置。

### 设置子 Agent 数量与并发

在画布选中 **Agent 节点**，将 **执行方式** 设为 **Provider · 原生交接**，再设置 **子 Agent 数量**：

| 设置 | 含义 |
| --- | --- |
| 自动 | 没有列表 fan-out 时使用一个 Agent；启用 fan-out 后，根据输入列表和批次大小计算数量 |
| 固定数量（1–32） | 将输入列表分给指定数量的 Agent；输入项不能少于 Agent 数量 |
| `batch_size` | 每批处理的条数（1–32）；批处理使用 `distribution: "partition"` |
| `max_concurrency` | 同时运行的批数上限（1–32），不是节点的总批数 |
| `scheduling: "parallel"` | 并行运行批次，由 `max_concurrency` 限制同时运行的批数 |
| `scheduling: "serial"` | 前一批结果记入记录后才释放下一批 |

自动模式下启用 **列表 fan-out**，再在 **运行时 fanout 合同** 配置分配和调度字段。例如 31 项输入、自动数量、`distribution: "partition"`、`batch_size: 10`、`scheduling: "parallel"`、`max_concurrency: 2`，会产生 4 批，每批最多 10 项，同时最多运行 2 批。输入绑定和结果名称必须与节点定义一致。修改后先保存、校验并发布，再启动新 Run。

Main 节点没有这个数量选项。Thread 续聊复用一个已有 task；Role 委派一个帮手。列表分发配置在 Workflow 节点中。

Codex 也限制一个会话里同时打开的子 Agent 数量。在用户配置 `~/.codex/config.toml`（Windows：`%USERPROFILE%\.codex\config.toml`）或项目配置 `.codex/config.toml` 已有的 `[agents]` 段中，可设置例如：

```toml
[agents]
max_concurrent_threads_per_session = 8
```

这个上限不包含 Main，也不表示每次都会启动 8 个 Agent。现有配置可能使用兼容别名 `max_threads`，不需要两者都写。Workflow 的 `max_concurrency` 不会提高 Codex 会话上限。详见 [Codex 官方子 Agent 文档](https://learn.chatgpt.com/docs/agent-configuration/subagents)。

### 保存与运行

以下操作的结果不同：

1. **校验**：检查当前定义和契约。
2. **保存草稿**：保存编辑内容，但不会创建可启动的已发布版本。
3. **发布 Workflow**：固定修订并检查启动阻塞项。
4. **新建任务**：基于已发布版本启动一次 Run。

结构有效不代表当前机器满足全部运行依赖。节点 Provider、工具、环境与 Run 输入会在启动时继续检查。

运行设置可以指定现有项目目录；留空时由 Host 创建工作区。可复用 Workflow 不应写死作者机器上的项目路径。

在 Codex 中运行已安装并发布的 Workflow：

```text
使用 $codex-agents-workflow:workflow-control-plane。
运行我从 Workflow Package 安装、用于当前任务的 Workflow。
使用我在本次对话中提供的目标与材料。
```

如果没有匹配的已发布 Workflow，Main 应明确说明，不会虚构或静默改用另一条定义。

## 8. Run 执行时发生什么

Main 有两种 Workflow 执行方式：

| 模式 | 执行与上下文 |
| --- | --- |
| Main（worker） | 可选的新会话，使用启动 Main 的模型，只获得声明的节点输入和资源。未指定模式的旧 Main 节点保留这一行为。 |
| Main（orchestration） | 由实际启动任务的 Main 聊天接手该节点，并沿用现有可用对话上下文；从该聊天或内嵌工作台启动。 |

orchestration Main 节点是启动 Workflow 的 Main 本人继续执行流程，与新建 Main worker 会话、普通任务中自动选择帮手 Role 是三种不同情况。独立控制台没有启动聊天的上下文，会说明 orchestration Workflow 必须从聊天启动。

Workflow 节点与原生子 Agent 使用节点级输入，不会自动继承父聊天、环境 Skill 目录或其他节点的原始对话。Host 准备路径、绑定、结果 schema 和恢复记录；节点把产物写入指定工作区，再返回简短状态和文件位置。前置任务交接后，Host 等待事件，不让 Main 轮询。并行批次成功结果会保留，返修可以只处理失败项。

## 9. 原生 Agent、Thread 与运行记录

普通独立工作默认使用原生 Agent。Thread 适用于后续阶段必须继续同一个侧栏可见 Codex task 的流程。续聊节点引用准确记录的 task 身份，不会创建替代 task，也不提供额外的操作系统隔离。Thread 保留更多对话状态，不是默认执行方式。

启动 Run 时会清理结束超过 24 小时的完成和失败记录。运行页面也提供 **清理历史** 操作，可立即清理符合条件的已结束记录。活动、中断、暂停和尚未确认停止的任务会保留，工作区产物不会被删除。

## 10. 恢复与连接排查

| 现象 | 检查方法 |
| --- | --- |
| 安装或更新后看不到工作台或插件工具 | 使用宿主的插件目录重新加载或 MCP 重新连接功能，再打开工作台，并在当前执行会话中调用插件工具。只有刷新方式不可用或已证明确实无效时才重启 Codex。 |
| 重新打开页面后工具调用仍失败 | 检查插件用户数据目录中的 `mcp-startup.jsonl` 与 Codex 宿主启动日志。只刷新 Skill 目录不会重新连接 MCP。 |
| Role 显示 Provider 未启用 | 分别启用对应 Provider 和 Role，或把 Role 绑定到可用 Provider。 |
| 安装的 Workflow 不能启动 | 检查启动阻塞项、节点 Provider、声明工具、依赖和本次 Run 输入。 |
| authoring 停止 | 查看明确错误和 Run 记录；检查 Codex 登录、所选模型、依赖条件和 Host 启动日志。 |
| 子 Agent 没有继续 | 查看 Run 是在等待、失败还是需要处理，然后让 Host 的事件等待继续推进。 |
| 页面断开但 Run 仍在运行 | 重新打开运行页面并恢复原 Run；继续前先核对记录状态和实际产物。 |

打开 App 不代表 MCP 连接已经可用。应在将执行工作的会话中成功调用插件工具后再确认连接恢复。让 Codex 检查已有 Run 的节点和本地产物，再从未完成步骤继续；恢复不会重做成功节点，也不会自动批准人工确认点。

## 11. 更新

更新本地克隆：

```sh
git pull --ff-only origin main
```

拉取后，在 Windows 安装当前本地插件版本：

```powershell
node plugins/codex-agents-workflow/scripts/install-local.mjs
```

使用宿主的插件目录重新加载或连接刷新功能，再打开内嵌工作台。只有相关刷新方式不可用或已证明确实无效时才重启 Codex。CLI task 使用自己的 MCP 重新连接方式，并在该会话中成功调用插件工具验证。打开工作台不需要新建 task。

Workflow 定义、Role 自定义、Provider 设置和 Run 记录保存在用户级 Codex 配置目录。
