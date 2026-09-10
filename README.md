# Codex Agents Workflow

**把一个复杂任务，变成可以配置模型、并行执行、暂停确认和重复使用的工作流。**

这是 **sol-subagent-control 的升级版**：从控制子 Agent 的分工，发展为带可视化工作台的 Workflow 插件。你可以把已有 Skill 转成流程图，为不同节点指定模型与推理强度，让主 Agent 按依赖调度子 Agent，或创建、续聊独立的 Codex task，最后检查成果。

[中文](README.md) · [English](README.en.md) · [中文操作教程](docs/TUTORIAL.zh-CN.md) · [English guide](docs/TUTORIAL.md)

## 为什么做这个

Astra 很强，也很贵。整理材料、执行明确的修改、批量处理和最终判断，没有必要全部交给同一个高成本模型。

工作流让你把分工固定下来：常规步骤交给较轻的模型，复杂分析交给更强的模型，重要检查保留独立审阅；主 Agent 负责理解目标、协调、处理用户反馈和验收。各个子任务在自己的上下文里工作，主会话收集必要的结果与证据，减少大量中间过程挤占主 Agent 的上下文。

让合适的模型完成各自的步骤，可以控制整套任务的成本，也减少主会话需要携带的中间上下文。

| 工作 | 可以怎样分配 |
| --- | --- |
| 明确范围的实现、素材整理、常规验证 | 配置一个适合常规工作的子 Agent |
| 跨文件判断、复杂方案、困难分析 | 为该节点配置更强的模型 |
| 独立检查 | 使用单独的只读审阅节点 |
| 需要你做决定的步骤 | 加入用户确认节点 |
| 需要持续修改同一份方案的工作 | 创建 Codex task，后续节点继续同一个 task |
| 总体协调与最终验收 | 留给当前主 Agent；它的模型由 Codex 本身决定 |

模型不是按这些描述写死的。你在工作台选择具体配置，新的运行固定这些绑定，不会因某个模型失败就悄悄换成另一个。

## 能做什么

- **可视化编排**：编辑步骤、连线、条件、并行分支和人工确认点。
- **Skill → Workflow**：导入 Skill 及其引用资源，生成可检查、可修改的流程草稿。
- **每个节点分别配置模型**：原生子 Agent 可设置模型与推理强度；可接入 Cursor、Grok 等已配置的执行端。
- **Thread 控制**：主会话可以创建独立 Codex task，等待完成，再把新材料交给原 task 继续工作。
- **运行记录与验收**：查看节点状态、审批、输出和错误；每次运行固定版本，编辑流程不会改写已有运行。
- **中英切换**：模型设置与流程工作台共用 中文 / English 选择，保留未保存草稿。你自己填写的名称、提示词和模型 ID 不会被翻译。

工作台用来配置和查看，**实际使用时也可以直接在 Codex 里用自然语言调用工作流**。

## 先装起来

需要支持插件与相关任务工具的 Codex、Node.js 20+ 和 Git。Cursor / Grok 是可选接入；没有安装它们也可以先使用原生 Codex 子 Agent。

下面用本地克隆安装，便于找到启动脚本和示例：

```sh
git clone https://github.com/TohmaN233/codex-agents-workflow.git
cd codex-agents-workflow
codex plugin marketplace add .
codex plugin add codex-agents-workflow@codex-agents-workflow
node plugins/codex-agents-workflow/scripts/install-agents.mjs
```

安装后打开一个新的 Codex task，让它加载插件的 Skills 和工具。

### 打开工作台

最简单的方式，直接告诉 Codex：

```text
使用 $codex-agents-workflow:workflow-control-plane，打开工作台。
```

也可以从刚才克隆的仓库手动打开。Windows 双击：

```text
plugins\codex-agents-workflow\scripts\open-control-console.cmd
```

或在仓库目录运行：

```powershell
.\plugins\codex-agents-workflow\scripts\open-control-console.cmd
```

macOS / Linux 从仓库根目录运行：

```sh
sh plugins/codex-agents-workflow/scripts/open-control-console.sh
```

Windows 启动器打开已安装的插件；`.sh` 脚本启动当前克隆目录中的工作台。需要 Node.js 20+，启动后保持终端进程运行。

![在工作台中给执行节点选择模型](docs/assets/tutorial/workbench-node-model.png)

## 第一步：配置模型，再点自动生成

**工作台里的模型配置必须可用，才能直接点击按钮生成 Workflow。** 当前主会话正在使用某个模型，不代表工作台已经配置好了生成器和审核器。

1. 打开右上方 **Provider 设置**。启用需要的原生模型配置，填写模型 ID、推理强度和读写能力，再保存。
2. 导入 Skill 后，进入 **导入审查 → 高级选项：执行设置、路由规则与导入诊断**。
3. 选择 **默认生成执行者（已注册模型配置）** 和 **审核执行者（已注册模型配置）**。这里当前使用已注册的原生模型配置；Cursor / Grok 不充当这一自动转换按钮的生成器。
4. 检查 `skill2workflow` 路由规则：为规划、普通执行、复杂执行等职责配置合适的 Provider。生成模型只负责转换，不会自动成为所有执行节点的模型。
5. 返回上方，点击 **自动生成 Workflow**。页面会显示生成、审核和必要的修正进度。默认复用当前 Codex 登录；缺少登录、模型或能力时，会显示需要处理的原因。

启用一个 Provider 或保存配置本身不会开始模型调用。点击生成、启动运行或明确要求 Codex 执行之后，才进入对应任务。

## 示例一：把 Skill 转成工作流

以开源视频剪辑 Skill [browser-use/video-use](https://github.com/browser-use/video-use) 为例。先按源仓库说明安装，再把它导入工作台。它的 [SKILL.md](https://github.com/browser-use/video-use/blob/main/SKILL.md) 定义了检查素材、提出方案、询问用户、制作预览和最终交付的步骤。

1. 在流程库点击 **从 Skill 导入**。
2. 扫描默认 Codex 目录，或填写自己存放 Skill 的文件夹。
3. 找到目标，点击 **导入此版本**。插件保留这个版本的指令与资源快照，源 Skill 不会被修改。
4. 按上一节配置生成与审核模型，再点击 **自动生成 Workflow**。
5. 检查生成的步骤、依赖、用户确认点和逐项审核清单。确认后保存为可编辑草稿，在画布里调整每个节点。
6. 保存并发布；发布成功只表示流程可用于启动，**不会立刻执行剪辑**。

![Skill 转工作流：自动生成及审核进度](docs/assets/tutorial/skill2workflow-generation.png)

生成和审核过程中可以查看进度；完成后回到画布编辑节点。

![video-use 转换后的确认、制作和验证流程](docs/assets/tutorial/workbench-video.png)

转换的价值是把 Skill 里的执行顺序变成明确的依赖，把“先问用户再制作”变成一个会停下来的节点，并把适合并行的独立工作分开。**生成后仍需检查原 Skill 的规则是否保留，以及实际工具和资源是否具备。**

不想操作页面时，也可以直接告诉 Codex：

```text
使用 $codex-agents-workflow:workflow-control-plane。
把我指定目录里的 video-use Skill 导入并转换为 Workflow。
按工作台已保存的模型配置分配节点，保留原 Skill 的确认步骤。
先给我看生成的草稿，暂时不要执行视频任务。
```

## 示例二：在 Codex 中直接执行 video-use

本例使用 [browser-use/video-use](https://github.com/browser-use/video-use) 转换后的工作流。源 Skill 单独安装，不随本插件打包；你也可以使用自己的写作、翻译、研究或代码处理 Skill。

```text
使用 $codex-agents-workflow:workflow-control-plane。
调用已发布的 video-use Workflow，为 YN Translation Workshop 剪辑介绍视频。
素材在 D:/demo/recordings，需求写在该目录的 剪辑需求.txt。
按 Workflow 配置的节点执行，需要我确认方案或预览时停下来问我。
```

下面三张图来自[实际使用会话](https://chatgpt.com/s/cx_6aa1e1db569c8191a4f7f2c394d53d4c)。它展示了“调用工作流 → 委派 → 用户确认 → 返回预览”的过程。

### 1. 按工作流委派

主 Agent 找到 `video-use`，把素材检查交给流程指定的 Terra 节点，同时向用户补齐声音偏好。

![主 Agent 按 Workflow 委派素材检查](docs/assets/tutorial/video-workflow-delegation.png)

### 2. 到确认点就询问用户

整理出剪辑方案后，工作流停在制作前的确认步骤，得到同意再继续。

![方案确认后继续制作](docs/assets/tutorial/video-workflow-approval.png)

### 3. 返回预览，等待定稿确认

制作完成后返回完整版和四支短片，用户可以查看预览、提出修改或确认定稿。

![工作流返回五支视频预览并询问是否定稿](docs/assets/tutorial/video-workflow-preview.png)

## 示例三：数学研究，什么时候值得保留一个 task

内置 **Mathematical Research Hybrid** 示例先并行开展文献、工具、类比和反例调查，再并行试探不同路线。独立工作使用一次性子 Agent。主 Agent 根据结果提议一次性总结或持续研究，用户批准方案后才进入相应分支；持续研究会创建并续聊一个保存研究状态的 Codex task。想调整建议时，先在会话中反馈，再确认修改后的方案。

![数学研究中的并行路线探索和节点模型设置](docs/assets/tutorial/workbench-math.png)

流程库已经有此定义时，可以直接调用：

```text
使用 Mathematical Research Hybrid，研究我下面给出的命题。
先明确假设与可能的反例，独立调查不同证明路线。
是否需要持续研究 task，由我看过路线后决定。
最后区分已证明内容、实验观察和仍未解决的问题。
```

也可以让 Codex 添加这个内置数学示例，再在工作台调整各节点的模型与研究指令。

## 新增的 Thread 控制是什么

这里的 thread 指 **Codex 中独立可见的 task / 会话**，不是操作系统线程。

普通子 Agent 适合“给定材料，做完这一步，返回结果”。独立 task 适合“先准备，等另一个分支完成后，再带着新信息继续同一份工作”。例如提示词准备和图片准备先并行，提示词就绪后续聊原来的图片 task，而不是再创建一个丢失上下文的新 task。

工作流记录 task 身份，后续节点继续同一个 task。你可以在 Codex 里看到和继续这些任务，主 Agent 负责分支交接与最终验收。

## 配置、更新与更多细节

模型配置保存在用户级目录：默认 `~/.codex/codex-agents-workflow/control-plane.json`；设置了 `CODEX_HOME` 时使用该目录。工作流与运行数据在同一用户配置体系下管理，不需要把自己的流程库提交到 GitHub。

README 中的模型组合与流程是使用示例。工作台按你的配置执行；模型可用性取决于实际 Codex 账号、版本和已连接的客户端。

- [完整中文教程：启动、生成、执行和排错](docs/TUTORIAL.zh-CN.md)
- [English guide](docs/TUTORIAL.md)
- [连接器契约](plugins/codex-agents-workflow/skills/control-plane/references/provider-contracts.md)

## 会话中断后如何继续

保留原运行 ID，直接告诉 Codex：“我授权你恢复这个运行的控制权，核对已有任务和产物后继续。”主会话就能接手，不必复制控制凭据。工作台也有“接管并暂停 Run”按钮。

恢复后从原有任务和产物继续，已经完成的步骤不必重复执行。

## License

[MIT](LICENSE)
