# Documentation content map

[Documentation index](README.md) · [Repository README](../README.md) · [中文内容图](content-map.zh-CN.md) · [中文主页](../README.zh-CN.md)

This map accounts for the useful topics in the pre-reorganization English and Chinese README snapshots, the retained tutorial and results entrypoints, and every dated record moved out of the reference directory.

## Former README topics

| Former topic | Current location | Disposition |
| --- | --- | --- |
| Project identity, website, installation requirements, clone/install commands, configuration, and first use | [English README](../README.md) · [中文 README](../README.zh-CN.md) | Kept on the landing pages in the requested Requirements → Installation → Configuration → Quick start order. Project site, repository, and author links remain present. |
| Why a process Skill benefits from a runtime | [Current architecture](architecture/overview.md) | Retained with current distinctions between semantic work and Host mechanics; no general token-saving claim. |
| Node-scoped context, Host-owned mechanics, event waiting, workspace artifacts, and failed-unit repair | [Current architecture](architecture/overview.md) · [Workflow schema](reference/workflow-schema.md) | Retained as current behavior where supported. Task-scoped inputs are explicitly not described as operating-system isolation. |
| Roles, Providers, Workflows, generated executor defaults, Main worker and orchestration, and persistent Threads | [Current architecture](architecture/overview.md) · [Using guide](guides/usage.md) | Retained with automatic Role selection for useful ordinary delegation when no Ready Workflow matches, Roles separate from Workflow node executors, and optional Main worker/Thread choices explicit. |
| Workbench entrypoints, built-in Workflows, optional packages, standalone console, updates, and recovery | [Using guide](guides/usage.md) · [Optional package index](../plugins/codex-agents-workflow/examples/workflows/README.md) | Retained in the operational guide and package index. Updates use reload or reconnect when available; restart is only a fallback when refresh is unavailable or ineffective. The official Codex subagent guide remains linked from the usage guide. |
| Historical simple-task and Zenonzard samples, methods, tables, SkillsBench sources, and ZZ-Project source | [English report](experiments/results.md) · [Chinese report](experiments/results.zh-CN.md) | Preserved as sample-specific historical results, with source links and scoring limits. They do not describe every current 1.2 Workflow. |
| The later claim that a source audit made the current checkout 31/31 | Omitted from current claims; [historical report](experiments/results.md) retains the measured 28/31 result | The prior scan found no durable inspected public evidence for the later repair claim. The report remains at its recorded experimental result; no current score is inferred. |
| Broad implication that parallelism or isolated context reduces cost or elapsed time | [Current architecture](architecture/overview.md) · [Experiment reports](experiments/README.md) | Qualified: the architecture can focus work, but savings, speed, and cache hits are not guaranteed. |
| Browser UI contributor check and runtime versions | [Repository README](../README.md#contributor-check) | Kept with the Node 22 web check; the installed Host minimum remains Node.js 20. |
| Workflow schema and bounded repair details | [Current schema reference](reference/workflow-schema.md) | Kept as the current format reference; links to two dated implementation records now point into experiments evidence. |
| Screenshots and the visual walkthrough | [Using guide](guides/usage.md) and [tutorial assets](assets/tutorial/) | Images stay with the guide and their paths are relative to the moved guide directory. |
| Security, project links, and the OpenAI MCP Extensions specification | [Security policy](../SECURITY.md) · [Plugin README](../plugins/codex-agents-workflow/README.md) | Existing policy, project, website, and specification links are retained. |

## Compatibility entrypoints

| Former path | Canonical page | Compatibility behavior |
| --- | --- | --- |
| docs/TUTORIAL.md | [English usage guide](guides/usage.md) | Stub retains the former section headings and anchors and links readers to the moved guide. |
| docs/TUTORIAL.zh-CN.md | [Chinese usage guide](guides/usage.zh-CN.md) | Stub retains the former Chinese headings and anchors. |
| docs/EXPERIMENT_RESULTS.md | [Chinese historical report](experiments/results.zh-CN.md) · [English counterpart](experiments/results.md) | Stub retains the report headings and anchors; its current links reach the preserved Chinese report. |

## Dated records retained under experiments

Each record below moved byte-identically from docs/reference to docs/experiments/evidence. The move changes its category, not its recorded findings or qualification boundary.

| Former topic | Retained record |
| --- | --- |
| Skill2Workflow execution evidence (2026-10-06) | [skill2workflow-execution-evidence-20261006.md](experiments/evidence/skill2workflow-execution-evidence-20261006.md) |
| Native upstream context (2026-10-08) | [native-upstream-context-20261008.md](experiments/evidence/native-upstream-context-20261008.md) |
| Generic Host observation batching (2026-10-08) | [generic-host-observation-batching-20261008.md](experiments/evidence/generic-host-observation-batching-20261008.md) |
| Host request initialization (2026-10-08) | [host-request-initialization-20261008.md](experiments/evidence/host-request-initialization-20261008.md) |
| Main semantic handoff projection (2026-10-08) | [main-semantic-handoff-projection-20261008.md](experiments/evidence/main-semantic-handoff-projection-20261008.md) |
| Worker Host completion (2026-10-08) | [worker-host-completion-20261008.md](experiments/evidence/worker-host-completion-20261008.md) |
| Direct Workflow execution (2026-10-09) | [direct-workflow-execution-20261009.md](experiments/evidence/direct-workflow-execution-20261009.md) |
| Main shared-prefix preparation (2026-10-09) | [main-shared-prefix-20261009.md](experiments/evidence/main-shared-prefix-20261009.md) |
| Main worker efficiency (2026-10-09) | [main-worker-efficiency-20261009.md](experiments/evidence/main-worker-efficiency-20261009.md) |
| Native cache and parallelism (2026-10-09) | [native-cache-and-parallelism-20261009.md](experiments/evidence/native-cache-and-parallelism-20261009.md) |
| Native local production investigation (2026-10-09) | [native-local-production-20261009.md](experiments/evidence/native-local-production-20261009.md) |
| Native preparation efficiency (2026-10-09) | [native-preparation-efficiency-20261009.md](experiments/evidence/native-preparation-efficiency-20261009.md) |
| Native tool context profile (2026-10-09) | [native-tool-context-profile-20261009.md](experiments/evidence/native-tool-context-profile-20261009.md) |
| Research boundary evidence (2026-10-11) | [research-boundary-evidence-20261011.md](experiments/evidence/research-boundary-evidence-20261011.md) |
