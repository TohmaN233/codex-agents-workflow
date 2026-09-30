# Codex Agents Workflow 操作教程

[返回 README](../README.md) · [English](TUTORIAL.md)

这份教程对应当前发布版工作台。它从默认的两个基础 Workflow 开始，说明 Role、Provider、Skill 转换、可选安装包、运行与恢复。

## 1. 安装并打开工作台

先按 [README 的快速开始](../README.md#快速开始)安装插件。支持 MCP Apps 的宿主会显示工作台的侧栏入口；也可以在当前 Codex task 直接告诉 Codex：

```text
使用 $codex-agents-workflow:workflow-control-plane，打开工作台。
```

工作台和 Provider 设置是 MCP App 页面，打开页面不会启动 Workflow。输入框支持 mentions 时，可以搜索 Workflow 或 Role 并引用它；引用只提供简要上下文，不授权执行。页面通过宿主通信桥访问现有 Host，完整配置不会进入聊天的打开结果。不同宿主支持的可选能力不同，以实际协商结果为准。

需要独立浏览器页面时，也可以从克隆仓库启动：

```powershell
.\plugins\codex-agents-workflow\scripts\open-control-console.cmd
```

```sh
sh plugins/codex-agents-workflow/scripts/open-control-console.sh
```

Windows 启动器根据 Codex 的安装记录打开当前插件版本；macOS / Linux 脚本从当前克隆目录启动。保持终端进程运行，不要分享启动器生成的含认证 token 的本机地址。

全新安装的流程库只包含两个 Workflow：**Build Workflow** 与 **Skill to Workflow**。Role 会单独显示，不会混进 Workflow 列表。

![当前流程库](assets/tutorial/workbench-library.png)

## 2. 先理解 Role、Provider 与 Workflow

| 对象 | 作用 | 是否创建 Run |
| --- | --- | --- |
| Provider | 连接实际模型或外部执行端 | 否 |
| Role | Main 自动调用一个帮手时使用的工作要求、权限与 Provider | 否 |
| Workflow | 有具体目标、节点依赖和完成条件的多步骤任务图 | 是 |

插件加载后，Main 会在普通任务适合委派时自动选择已启用的 Role；用户不需要点名 Role，也不需要先运行 Workflow。Main 会先继续不依赖帮手结果的工作，然后进入最长一小时的事件等待，等完成、失败或需要输入时被唤醒，最后检查真实改动和验证结果。

Role 使用 Grok 等内置连接器时，Host 通过 `workflow_start_role_connector` 直接启动选定的已发布 Role，编译并交付当前要求，不需要旧版任务类型，也不创建 Workflow Run。返回的任务标识用于查看状态和取消。原生 Role 使用返回的原生 Agent 启动配置；GPT reviewer 使用已配置的审阅包路线。

Workflow 节点不引用或注入 Role。节点只保存 Provider、节点任务、输入和权限。生成 Workflow 时可以根据任务类型选择适合的 Provider；运行时不会叠加工作台 Role。

默认状态：

- 原生 Codex Provider 已启用。
- 外部 Provider 已关闭。
- Cross-review Role 已关闭，但仍会显示并可编辑。
- GPT reviewer Role 已关闭并绑定现有的 `chatgpt-web-pro` Provider，不会复制 Provider 或 Role。
- Math、Zenonzard 与 video-use 没有自动安装。

被关闭的 Role 或 Provider 不会被静默替换。依赖它们的 Workflow 可以保存和安装，但在启用所需配置前不能启动。

## 3. 配置 Provider 与 Role

打开顶部的 **Provider 设置**。

### 原生 Provider

原生 Provider 使用当前 Codex 登录可用的模型目录。选择模型后，界面只显示该模型支持的推理强度。Role 负责表达“实现”“分析”“审阅”等行为，因此同一模型与推理强度不需要为每个用途重复创建 Provider。

Main 沿用启动聊天当前使用的模型和思考强度；独立从工作台启动时沿用用户的 Codex 设置。Workflow 节点和导出包不指定 Main 模型。

### 外部 Provider

外部 Provider 默认关闭。需要时在对应卡片中启用并填写端点、模型和认证方式。会话 API key 有单独输入位置，不会作为普通配置字段写入磁盘。`chatgpt-web-pro` 使用已安装的 `chatgpt-agent` Packet 路线；启用它后，GPT reviewer 会复用这一个连接。

保存 Provider 不会启动模型调用。

### 编辑 Role

在流程库点击 Role 卡片可以修改：

- 是否启用；
- Provider 绑定；模型与推理强度在 Provider 中配置；
- 只读或受限写入权限；
- Role 的行为说明。

Cross-review 默认绑定 `grok-local`，GPT reviewer 默认绑定 `chatgpt-web-pro`。这两个 Role 及其 Provider 在发布配置中默认关闭；分别启用 Role 和对应 Provider 后才可调用。

## 4. 从 brief 创建 Workflow

打开 **Build Workflow**，点击 **新建任务**，描述希望固化的流程，而不是某一次执行中的临时答案。

一个好的 brief 应该说明：

- Workflow 的目标和最终产物；
- 哪些步骤必须按顺序完成；
- 哪些工作可以真正并行；
- 哪些决定需要用户确认；
- 需要哪些本地文件、工具或外部服务；
- 怎样判定完成，失败后应从哪里继续。

Build Workflow 中的 Agent 只提交语义节点和约束。Host 负责生成节点 ID、连线、schema、绑定、哈希、依赖清单和发布前机械校验。不要在 brief 中要求模型手抄随机 ID 或编码字段。

生成结束后会得到一个可编辑草稿。先检查图和属性，再保存、校验与发布。

## 5. 把 Skill 转成 Workflow

在流程库点击 **从 Skill 导入**：

1. 扫描默认 Codex Skill 目录，或选择包含目标 Skill 的文件夹。
2. 核对名称、位置和来源版本，点击 **导入此版本**。
3. 打开 **导入审查**，查看来源、资源、依赖和转换状态。
4. 启动 Skill to Workflow 的生成过程。
5. 检查生成的节点、连线、人工确认点和来源要求映射。
6. 接受结果后保存为普通可编辑草稿，再按实际需求调整。

转换时主要检查：

- 原 Skill 的硬性规则和验收条件是否保留；
- 真正独立的步骤才并行；
- 前置输出是否只传给需要它的节点；
- 用户确认是否发生在产生外部影响之前；
- 任务需要的读写、看图、代码或工具能力是否仍然可用；
- 本机绝对路径是否被运行输入或可移植依赖替代。

Skill 转换不会修改原文件，也不会自动执行原业务任务。发布生成的 Workflow 也不会立刻启动一次 Run。

## 6. 安装可选 Workflow

Math、Zenonzard 与 video-use 的可安装包位于：

```text
plugins/codex-agents-workflow/examples/workflows/
```

点击流程库中的 **安装 Workflow**，直接选择一个 `*.workflow-package.json` 文件。安装会校验包格式、内容哈希、兼容性与依赖声明；它不会自动启动任务，也不会静默安装缺失程序。

如果安装后显示不能启动，检查：

- 所需 Role 是否启用；
- 绑定的 Provider 是否启用并可用；
- 本机是否存在声明的工具或服务；
- 本次任务是否已经提供实际素材目录或工作区。

### 两种导出的区别

- **完整 Pack 快照**：保存编辑器使用的完整修订和资源，适合审计与排障，可能包含私有转换素材。
- **可安装包**：包含兼容性、依赖和完整性清单，并排除私有来源材料，用于另一台电脑安装。

跨电脑移动 Workflow 时使用“可安装包”。不要把本机素材绝对路径当作可移植依赖写进包里。

## 7. 编辑、保存、发布与运行

打开 Workflow 后进入当前画布：

![当前 Workflow 画布](assets/tutorial/workbench-editor.png)

左侧添加节点，中间编辑连线，右侧修改 Workflow 或当前节点属性。顶部标签可以查看资源、导入审查、版本、完整 IR 和运行设置。

四个动作含义不同：

1. **校验**：检查当前定义的结构与契约。
2. **保存草稿**：保存编辑内容，但不产生可启动的新发布版本。
3. **发布工作流**：固定修订并检查启动阻塞项。
4. **新建任务**：使用已经发布的固定修订启动一次 Run。

“结构有效”不代表当前机器已经满足全部运行依赖。Provider、Role、工具、环境和用户输入会在启动边界继续检查。

运行现有项目时可以在运行设置中提供项目目录；留空时由 Host 创建工作目录。可复用 Workflow 本身不应写死作者电脑上的项目路径。

也可以直接在 Codex 中调用已经发布的 Workflow：

```text
使用 $codex-agents-workflow:workflow-control-plane。
运行我已安装的 video-use Workflow。
本次素材目录是 D:/demo/recordings；需要确认方案或预览时停下来。
```

如果没有匹配的已发布 Workflow，Codex 应明确说明，不会假装存在或静默换用另一条流程。

## 8. Run 执行时发生什么

### 节点只获得需要的上下文

Main 节点与原生子 Agent 节点都使用节点级输入投影。它们不会自动继承父聊天、环境 Skill 目录或其他节点的原始对话，但仍保留任务所需的基本读写、看图、代码与工具能力。

### Host 负责机械字段与交接

Host 准备任务包、路径、ID、哈希、绑定和结果 schema。节点直接把代码或产物写入工作区，只返回简短状态与文件位置。

### Main 不轮询等待

子 Agent 启动后，Host 持有最长一小时的事件等待。完成、失败、需要处理、子 Agent 结果或 handoff 会立即推进执行链。等待超时只会续接同一个等待，不会让 Main 每隔几十秒重新读取状态。

### 失败单元单独重试

并行分片有独立的尝试和产物。一个分片失败时，成功分片继续保留；返修只处理失败项及其证据。

## 9. 原生 Agent 与 Thread

普通独立工作默认使用原生 Agent。它适合一次读取任务材料、直接在本地完成修改，并返回产物位置。

Thread 用于确实需要在多个阶段续聊同一个侧栏可见 task 的流程。后续节点必须引用已记录的准确 task 身份，而不是重新创建一个看似相同的会话。Thread 不是默认执行方式，也不提供额外的操作系统隔离。

可选 Math Workflow 展示了这种选择：短调查使用一次性 Agent，只有需要持续研究时才保留 Thread。

## 10. 恢复与排错

| 现象 | 应检查什么 |
| --- | --- |
| 新 task 找不到插件工具 | 检查插件是否启用；重新安装后必须新建 task |
| Role 卡片显示 Provider 未启用 | 到 Provider 设置启用对应连接，或给 Role 选择可用 Provider |
| Workflow 安装成功但不能启动 | 检查 Role、Provider、工具、依赖和本次输入 |
| 生成过程停止 | 查看明确错误与 Run 记录；检查登录、模型、依赖和 Host 日志 |
| 子 Agent 没有继续 | 查看 Run 是否处于等待、失败或需要处理；不要另开轮询循环 |
| 页面断开但任务仍在运行 | 使用原 Run ID 恢复控制，先核对真实任务与产物 |
| 更新后仍是旧界面 | 结束旧控制台并通过安装记录重新打开当前版本 |

恢复时可以告诉 Codex：

```text
恢复 Run <run-id> 的控制权，先核对已有节点、Agent 和本地产物，再从未完成处继续。
```

恢复不会自动重做成功节点，也不会自动批准人工确认点。

## 11. 更新

从本地克隆更新：

```sh
git pull --ff-only origin main
```

Windows 运行：

```powershell
node plugins/codex-agents-workflow/scripts/install-local.mjs
```

安装器会安装当前版本并清理不再使用的旧插件缓存；不会为了回退而永久保留旧版本。安装完成后新建 Codex task，让它加载新的 Skills、Role 与工具。

工作流、Role 自定义、Provider 配置和 Run 记录保存在用户级 Codex 配置目录，不需要提交到仓库。
