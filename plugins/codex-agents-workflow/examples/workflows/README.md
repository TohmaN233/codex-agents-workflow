# Optional Workflow examples

[English](#optional-workflow-examples) · [中文](#中文)

These installable packages are examples and references for authoring reusable Workflows. They are not installed by default. A fresh library contains **Skill to Workflow** and **Build Workflow**.

The separately maintained [Workflow Package collection](https://github.com/TohmaN233/workflow-package/tree/main/codex) contains the Answer me with HTML and GitHub README generator conversions, source credits and experiment notes. Those packages are not bundled here or installed by default.

See the [documentation index](../../../../docs/README.md) and [usage guide](../../../../docs/guides/usage.md) for current setup and execution steps.

| Package | Purpose |
| --- | --- |
| [Mathematical research](mathematical-research-hybrid.workflow-package.json) | Parallel research with an optional persistent research Thread. |
| [Video use](video-use.workflow-package.json) | Generated video-use Skill conversion. Requires the declared local media executables before launch. |
| [Zenonzard card implementation](zenonzard-card-implementation.workflow-package.json) | Generated card implementation and repair. Requires the declared repository tools before launch. |

In the workbench, choose **Install Workflow** and select a package file. Installation checks the package's format, content hash, compatibility, and declared dependencies; it does not install missing programs. Before launch, the package's declared Providers must be enabled and required local programs must be available.

## 中文

这些可安装包是创建可复用 Workflow 的示例和参考；默认不会安装。全新流程库只包含 **Skill to Workflow** 和 **Build Workflow**。

独立维护的 [Workflow Package 仓库](https://github.com/TohmaN233/workflow-package/tree/main/codex)提供 Answer me with HTML 和 GitHub README generator 转化包、原来源及实验说明。这两个包不内置于插件，也不会默认安装。

当前设置和运行步骤见[中文文档索引](../../../../docs/README.zh-CN.md)与[操作教程](../../../../docs/guides/usage.zh-CN.md)。

| 安装包 | 用途 |
| --- | --- |
| [数学研究](mathematical-research-hybrid.workflow-package.json) | 并行研究，可选用持久化研究 Thread。 |
| [视频处理](video-use.workflow-package.json) | 由 video-use Skill 转换生成。启动前需要已声明的本地媒体可执行程序。 |
| [Zenonzard 卡牌实现](zenonzard-card-implementation.workflow-package.json) | 生成卡牌实现与返修流程。启动前需要已声明的仓库工具。 |

在工作台中选择 **安装 Workflow**，再选择对应的安装包文件。安装时会检查格式、内容哈希、兼容性和依赖声明，但不会安装缺少的程序。启动前，安装包声明的 Provider 必须已启用，所需的本地程序也必须可用。
