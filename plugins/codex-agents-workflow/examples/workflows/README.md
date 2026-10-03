# Optional Workflow examples

These installable packages are examples and references produced with the same
authoring pipeline shipped by the plugin. They are intentionally not installed
by default. A fresh library contains only `system.skill2workflow` and
`system.build-workflow`.

| Package | Purpose |
| --- | --- |
| `mathematical-research-hybrid.workflow-package.json` | Parallel mathematical research with an optional persistent research thread. |
| `video-use.workflow-package.json` | Generated video-use Skill conversion. Requires the declared local media executables before launch. |
| `zenonzard-card-implementation.workflow-package.json` | Generated Zenonzard card implementation and repair workflow. Requires the declared repository tools before launch. |

Install a package from **Workflow library → Install Workflow → Choose file**,
or ask an Agent to install the package by its local path. Package installation
checks its content hash, structure, Providers, and Role identities. The examples
that reference `Cross-review` install successfully while that Role is disabled,
but remain blocked from starting until the user enables the Role and selects an
available Provider for it.

这些包仅作为可选安装示例和用户生成 Workflow 时的参考。全新安装默认只显示
`Skill to Workflow` 与 `Build Workflow`。可以在工作流页选择文件安装，也可以让
Agent 按本地文件路径安装。引用 `Cross-review` 的包仍可安装；该 Role 默认关闭，
用户启用并选择可用 Provider 后才允许启动相关 Workflow。
