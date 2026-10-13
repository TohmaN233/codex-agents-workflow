# 安装 Codex Agents Workflow

[English](INSTALL.md) · [使用指南](docs/guides/usage.zh-CN.md)

本文是人和 LLM 都可以执行的安装步骤。用户要求安装后，执行适用步骤，复用已经可用的依赖，并验证结果。把仓库和临时下载统一放在选定的安装目录，自动发现接收电脑上的真实路径，不把示例当成本机固定路径。

## 1. 检查接收环境

识别操作系统和架构，然后分别运行已经存在的命令：

```sh
node --version
git --version
codex --version
codex plugin --help
```

引擎需要 **Node.js 20+**、**Git**，以及支持插件和 MCP Extensions 的 Codex 宿主。新安装优先选择仍受维护的 Node LTS，版本至少 22，这也覆盖视频包的 Node 要求。普通插件安装无需 Python、FFmpeg、额外下载浏览器或安装开发用 npm 依赖。

只补齐缺失依赖，使用接收系统已有的包管理器：

| 系统 | Node.js | Git |
| --- | --- | --- |
| Windows，已有 WinGet | `winget install --id OpenJS.NodeJS.LTS -e --source winget` | `winget install --id Git.Git -e --source winget` |
| macOS，已有 Homebrew | `brew install node` | `brew install git` |
| Debian/Ubuntu | 先检查 `nodejs` 候选版本，满足要求才和 `npm` 一起安装；版本过旧时使用适配当前架构的官方 Node 下载 | 先运行 `sudo apt-get update`，再运行 `sudo apt-get install -y git` |

来源：[Node 下载与校验](https://nodejs.org/en/download)、[WinGet Node 包](https://github.com/microsoft/winget-pkgs/tree/master/manifests/o/OpenJS/NodeJS/LTS)、[Git Windows 安装](https://git-scm.com/install/windows)、[Homebrew Node](https://formulae.brew.sh/formula/node)。

没有包管理器或管理员权限时，可下载适配系统和架构的官方 Node 便携包，核对官方校验值，并将其可执行目录提供给宿主。安装后重新确认命令位置和版本；已经启动的宿主进程可能仍使用旧 PATH。如果没有 `codex plugin --help`，需要先获得支持插件的 Codex 宿主。缺失的前置条件必须明确报告，不能跳过后声称安装完成。

## 2. 安装插件及原生上下文配置

在选定的父目录中执行：

```sh
git clone https://github.com/TohmaN233/codex-agents-workflow.git
cd codex-agents-workflow
codex plugin marketplace add .
node plugins/codex-agents-workflow/scripts/install-local.mjs
```

已经有仓库时，先确认 origin 和工作区状态。干净的 `main` 使用 `git pull --ff-only` 更新；保留本地修改，发生分歧时报告，不能直接重置。复用已经匹配的 marketplace 注册。安装脚本会调用 `codex plugin add codex-agents-workflow@codex-agents-workflow`，注册插件拥有的 `caw_native_builtins` 上下文配置，并在安装成功后清理核实身份的旧插件缓存版本。使用这个脚本才能一并安装上下文配置。

检查脚本的 JSON 结果：应包含 `installed: true` 和成功的原生上下文配置注册。非零退出即安装失败。不要手写已安装插件记录，也不要修改配置版本号来强行通过。

## 3. 确认当前连接

当前宿主仍暴露旧版本时，刷新插件/MCP 连接。有宿主刷新或重载接口就使用它；接口不存在或实际失败时才要求重启。随后发现**当前对话**中的 CAW 工具，调用 `workflow_list` 与 `workflow_role_templates`。这两项只读取元数据，不调用模型，也不启动业务 Run。

CLI 安装成功或独立服务握手成功，不等于当前对话已经接入。诊断时若运行 `scripts/check-mcp-startup.mjs`，应从真实安装后的插件目录执行，让稳定缓存命名空间提供启动上下文，不能从源码目录执行后当作宿主连接证据。

全新安装直接创建当前 **v7** 配置和 Workflow store，提供 **Build Workflow**、**Skill to Workflow** 及当前内置 Role。原生 Provider 默认启用，外部 Provider 按需配置。更新时保留已有 Provider、Workflow、凭据和 Run。旧配置沿用[使用指南](docs/guides/usage.zh-CN.md)中的升级/恢复流程；新安装无需旧配置迁移。

新配置默认启用 Strict。所选路线需要本地 Codex 执行器时，Host 自动发现接收端安装、计算可执行文件摘要并检查必要能力。首次使用无需用户或 LLM 手填路径/hash。已有的明确关闭及认证设置保留。缺少程序、登录不可用或宿主不兼容时，仍报告实际缺失；启用 Strict 不会跳过这些要求。普通 cooperative 执行使用自己的资格检查，不受可选 Strict 开关阻拦。

## 4. 按需安装可复用 Workflow

选定安装包后，按照 [Workflow Package 安装说明](https://github.com/TohmaN233/workflow-package/blob/main/workflow_explanations/install.zh-CN.md)执行。它包含导入工具、文件摘要、包内资源、Provider 要求和路线依赖。

导入安装包会恢复声明的文件和工具，不会安装外部软件，也不会提供服务凭据。同时读取包依赖清单和所选节点的 `runtime_requirements`，只补齐目标路线需要的依赖。自动发现不足时，在工作台依赖设置中绑定本机查到的可执行路径。用户打算使用外部服务时再配置该服务。

## 5. 用证据结束安装

报告安装来源/版本、已解析的可执行程序版本与路径、当前 MCP 元数据检查结果，以及安装包 ID 和尚缺少的路线依赖。安装验收使用元数据与本地诊断，无需运行 benchmark、付费配音或仓库的完整开发测试。

存在阻塞时，指出具体失败步骤和错误。先完成不依赖它的工作；只有现有接口无法完成的选择、账号登录、凭据或管理员操作才需要用户处理。连接不完整或所选路线依赖不完整时，不能声称已经就绪。

开发者检查见[仓库 README](README.zh-CN.md)。普通安装已经包含提交的浏览器界面产物。
