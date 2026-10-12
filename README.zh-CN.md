<div align="left">
    <img alt="Codex Agents Workflow 图标" src="plugins/codex-agents-workflow/assets/icon.svg" width="80">

<h1>Codex Agents Workflow</h1>

[![MIT Licensed](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)
![verify](https://github.com/TohmaN233/codex-agents-workflow/workflows/verify/badge.svg)

</div>

[项目主页](https://tgy233.top/tgypage/caw/) · [仓库](https://github.com/TohmaN233/codex-agents-workflow) · [作者](https://github.com/TohmaN233) · [English](README.md)

Codex Agents Workflow 1.2 是一套本地 Codex 工作台，用于构建、审查、安装和运行可复用的任务图。Workflow 节点绑定到已配置的 Provider；Role 是独立的帮手配置，Main 可在普通任务中选择使用。Host 调度 Run 并记录恢复状态，Main 检查结果后再决定是否接收。

生成的 Workflow 使用 Provider 子 Agent 执行独立工作，并由发起任务的 Main 对话负责流程编排和语义验收。Main worker 会话和持久化 Codex Task 是编辑器中的可选设置。节点只接收声明的输入和资源；独立工作可在配置上限内并行运行。这些边界有助于聚焦任务，但不保证成本或耗时会降低。

## 需求

需要支持插件和 MCP Extension 的 Codex 宿主、Node.js 20 或更高版本，以及 Git。

## 安装

先克隆本仓库，再运行：

```sh
git clone https://github.com/TohmaN233/codex-agents-workflow.git
cd codex-agents-workflow
codex plugin marketplace add .
codex plugin add codex-agents-workflow@codex-agents-workflow
```

## 配置

原生 Codex Provider 默认启用。外部 Provider 以及 **Cross-review** 和 **GPT reviewer** Role 均为可选项；如需使用，须在 **Provider 设置**中分别启用对应的 Role 和 Provider。

## 快速开始

在 Codex task 中打开内嵌工作台：

```text
Use $codex-agents-workflow:workflow-control-plane and open the workbench inside Codex.
```

选择 **Build Workflow** 描述可复用流程，或选择 **Skill to Workflow** 转换固定版本的 Skill。打开工作台不会启动 Run。

默认 authoring 会审查结果，并发布已启用且可启动的 Workflow。检查流程图后，选择 **新建任务** 并输入本次 Run 的目标。如果希望自行确认发布，请在 authoring 前选择 **生成后保留审核草稿，等待我确认**。

## 文档

- [文档索引](docs/README.zh-CN.md) — 用户指南、当前架构、Workflow 格式、历史实验结果和主题覆盖图。
- [操作教程](docs/guides/usage.zh-CN.md) · [English guide](docs/guides/usage.md)
- [当前架构](docs/architecture/overview.zh-CN.md) · [Workflow Schema 参考](docs/reference/workflow-schema.zh-CN.md)
- [历史实验结果](docs/experiments/results.zh-CN.md) · [English report](docs/experiments/results.md)
- [可选 Workflow 安装包](plugins/codex-agents-workflow/examples/workflows/README.md) · [安全策略](SECURITY.md)
- [Workflow Package 独立仓库](https://github.com/TohmaN233/workflow-package) — 自选安装的 HTML／视频与 README 包，含原 Skill 来源和对照说明，与插件默认配置分开维护。

## 贡献者检查

如需检查浏览器 UI 资源，请使用 Node.js 22 或更高版本，并在 `plugins/codex-agents-workflow/control-plane` 目录中运行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:web
```

## 许可证

[MIT](LICENSE)
