# Codex Agents Workflow 1.2

[English](#codex-agents-workflow-12) · [中文说明](#中文说明)

A local Codex MCP Extension workbench for reusable agent Workflows, Roles, Providers, and recoverable Runs. Workflow nodes bind to Providers; Roles are separately configured helper profiles for Main's ordinary task delegation.

Requires Node.js 20 or newer and a Codex host with plugin and MCP support. Embedded workbench views depend on the host's negotiated MCP Apps and Extensions capabilities. The standalone browser console uses the same local Host and configuration.

## Install and open

Install the plugin from a Codex marketplace. For the repository's marketplace commands, see the [root installation guide](../../README.md#installation). Open the workbench from the plugin entry or a current Codex task:

```text
Use $codex-agents-workflow:workflow-control-plane and open the workbench inside Codex.
```

The two built-in Workflows are **Build Workflow** and **Skill to Workflow**. External Providers and the **Cross-review** and **GPT reviewer** Roles are opt-in. See the [documentation index](../README.md), the [user guide](usage.md) for configuration, authoring, Run recovery, and connection troubleshooting, and the [Workflow Package collection](https://github.com/TohmaN233/workflow-package) for installable examples.

## Project links

- [Project site](https://tgy233.top/tgypage/caw/)
- [Repository](https://github.com/TohmaN233/codex-agents-workflow)
- [Security policy](https://github.com/TohmaN233/codex-agents-workflow/blob/main/SECURITY.md)
- [OpenAI MCP Extensions specification](https://github.com/openai/mcp-extensions/blob/node-v0.1.0/docs/spec.md)

[MIT license](../../LICENSE)

## 中文说明

Codex Agents Workflow 1.2 是本地 Codex MCP Extension 工作台，用于复用 Agent Workflow、Role、Provider 和可恢复的 Run。Workflow 节点绑定 Provider；Role 独立配置，供 Main 在普通任务中委派帮手。

需要 Node.js 20 或更高版本，以及支持插件和 MCP 的 Codex 宿主。内嵌工作台视图依赖宿主协商提供的 MCP Apps 和 Extensions 能力。独立浏览器控制台使用同一套本地 Host 和配置。

### 安装并打开

从 Codex marketplace 安装插件。仓库的 marketplace 命令见[根目录安装指南](../../README.zh-CN.md#安装)。可从插件入口或当前 Codex task 打开工作台：

```text
Use $codex-agents-workflow:workflow-control-plane and open the workbench inside Codex.
```

仅有的两个内置 Workflow 是 **Build Workflow** 和 **Skill to Workflow**。外部 Provider 以及 **Cross-review** 和 **GPT reviewer** Role 均为可选项。有关配置、创建、Run 恢复和连接排查，请参阅[中文文档索引](../README.zh-CN.md)和[操作教程](usage.zh-CN.md)；可安装示例见[Workflow Package 仓库](https://github.com/TohmaN233/workflow-package)。

### 项目链接

- [项目主页](https://tgy233.top/tgypage/caw/)
- [仓库](https://github.com/TohmaN233/codex-agents-workflow)
- [安全策略](https://github.com/TohmaN233/codex-agents-workflow/blob/main/SECURITY.md)
- [OpenAI MCP Extensions 规范](https://github.com/openai/mcp-extensions/blob/node-v0.1.0/docs/spec.md)

[MIT 许可证](../../LICENSE)
