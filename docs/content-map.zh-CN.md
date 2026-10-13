# 文档内容覆盖图

[文档索引](README.zh-CN.md) · [中文主页](../README.zh-CN.md) · [English](content-map.md)

本图列出原英文和中文 README 快照中有用的主题、保留的教程与实验结果入口，以及从 reference 目录迁出的所有按日期记录。

## 原 README 中的主题

| 原主题 | 当前所在位置 | 处理方式 |
| --- | --- | --- |
| 项目介绍、网站、安装要求、克隆与安装命令、配置和首次使用 | [英文 README](../README.md) · [中文 README](../README.zh-CN.md) | 保留在项目主页，并按 Requirements → Installation → Configuration → Quick start 的顺序呈现。项目主页、仓库和作者链接均保留。 |
| 为什么流程型 Skill 需要运行时 | [当前架构](architecture/overview.zh-CN.md) | 保留并说明当前语义工作与 Host 执行机制的区别；不作普遍节约 Token 的声明。 |
| 节点级上下文、Host 负责的机制、事件等待、工作区产物和失败单元返修 | [当前架构](architecture/overview.zh-CN.md) · [Workflow Schema](reference/workflow-schema.zh-CN.md) | 在现有支持范围内保留为当前行为，并明确说明按任务声明输入不等于操作系统隔离。 |
| Role、Provider、Workflow、生成的执行器默认值、Main worker 与 orchestration，以及持久 Thread | [当前架构](architecture/overview.zh-CN.md) · [操作教程](guides/usage.zh-CN.md) | 保留相关说明：没有匹配的 Ready Workflow 且适合委派时可以自动选择 Role；Role 与 Workflow 节点执行器分开；Main worker 和 Thread 是明确可选项。 |
| 工作台入口、内置 Workflow、可选安装包、独立控制台、更新和恢复 | [操作教程](guides/usage.zh-CN.md) · [可选安装包索引](../plugins/codex-agents-workflow/examples/workflows/README.md) | 在操作教程和安装包索引中保留。更新时优先使用可用的重新加载或重新连接方式；仅在刷新不可用或无效时才重启。操作教程保留 Codex 官方子 Agent 指南链接。 |
| 历史简单任务和 Zenonzard 样本、方法、表格、SkillsBench 来源及 ZZ-Project 来源 | [英文报告](experiments/results.md) · [中文报告](experiments/results.zh-CN.md) | 作为有样本和评分范围的历史结果保留，并保留来源链接和评分限制。它们不代表所有当前 1.2 Workflow。 |
| 后续源代码审计已使当前 checkout 达到 31/31 的说法 | 当前说法中省略；[历史报告](experiments/results.zh-CN.md)保留实测的 28/31 | 先前检查未找到可持久核验的公开证据支持后续修复说法。报告仍记录当时的实验结果，不推断当前得分。 |
| 暗示并行或上下文隔离一定会降低成本或耗时的笼统说法 | [当前架构](architecture/overview.zh-CN.md) · [实验报告](experiments/README.zh-CN.md) | 已加限定：这些做法可能让任务更聚焦，但不保证节约、提速或命中缓存。 |
| 浏览器 UI 贡献者检查和运行时版本 | [仓库 README](../README.zh-CN.md#贡献者检查) | 保留 Node 22 的 Web 检查；已安装 Host 的最低要求仍为 Node.js 20。 |
| Workflow Schema 和有界返修细节 | [当前 Schema 参考](reference/workflow-schema.zh-CN.md) | 作为当前格式参考保留；指向两份按日期保存的实现记录的链接已更新到实验目录。 |
| 截图和可视化讲解 | [操作教程](guides/usage.zh-CN.md)及[教程资源](assets/tutorial/) | 图片留在操作教程使用的目录中，资源路径已相对于迁移后的教程目录调整。 |
| 安全、项目链接和 OpenAI MCP Extensions 规范 | [安全策略](../SECURITY.md) · [插件 README](../plugins/codex-agents-workflow/README.md) | 保留现有策略、项目、主页和规范链接。 |

## 兼容入口

| 原路径 | 规范页面 | 兼容行为 |
| --- | --- | --- |
| docs/TUTORIAL.md | [英文操作教程](guides/usage.md) | 存根保留原章节标题和锚点，并指向迁移后的教程。 |
| docs/TUTORIAL.zh-CN.md | [中文操作教程](guides/usage.zh-CN.md) | 存根保留原中文标题和锚点。 |
| docs/EXPERIMENT_RESULTS.md | [中文历史报告](experiments/results.zh-CN.md) · [英文对应报告](experiments/results.md) | 存根保留原报告标题和锚点；当前链接指向保留的中文报告。 |

## 保留在 experiments 目录下的按日期记录

以下每份记录都从 docs/reference 原样迁至 docs/experiments/evidence。迁移只改变文档分类，不改变其中记录的发现或适用边界。

| 原主题 | 保留的记录 |
| --- | --- |
| Skill2Workflow 执行证据（2026-10-06） | [skill2workflow-execution-evidence-20261006.md](experiments/evidence/skill2workflow-execution-evidence-20261006.md) |
| 原生上游上下文（2026-10-08） | [native-upstream-context-20261008.md](experiments/evidence/native-upstream-context-20261008.md) |
| 通用 Host 观察批处理（2026-10-08） | [generic-host-observation-batching-20261008.md](experiments/evidence/generic-host-observation-batching-20261008.md) |
| Host 请求初始化（2026-10-08） | [host-request-initialization-20261008.md](experiments/evidence/host-request-initialization-20261008.md) |
| Main 语义交接投影（2026-10-08） | [main-semantic-handoff-projection-20261008.md](experiments/evidence/main-semantic-handoff-projection-20261008.md) |
| Worker Host 完成检查（2026-10-08） | [worker-host-completion-20261008.md](experiments/evidence/worker-host-completion-20261008.md) |
| 直接执行 Workflow（2026-10-09） | [direct-workflow-execution-20261009.md](experiments/evidence/direct-workflow-execution-20261009.md) |
| Main 共享前缀准备（2026-10-09） | [main-shared-prefix-20261009.md](experiments/evidence/main-shared-prefix-20261009.md) |
| Main worker 效率（2026-10-09） | [main-worker-efficiency-20261009.md](experiments/evidence/main-worker-efficiency-20261009.md) |
| 原生缓存与并行（2026-10-09） | [native-cache-and-parallelism-20261009.md](experiments/evidence/native-cache-and-parallelism-20261009.md) |
| 原生本地生产调查（2026-10-09） | [native-local-production-20261009.md](experiments/evidence/native-local-production-20261009.md) |
| 原生准备效率（2026-10-09） | [native-preparation-efficiency-20261009.md](experiments/evidence/native-preparation-efficiency-20261009.md) |
| 原生工具上下文配置（2026-10-09） | [native-tool-context-profile-20261009.md](experiments/evidence/native-tool-context-profile-20261009.md) |
| 研究边界证据（2026-10-11） | [research-boundary-evidence-20261011.md](experiments/evidence/research-boundary-evidence-20261011.md) |
