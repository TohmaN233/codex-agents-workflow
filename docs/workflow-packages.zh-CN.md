# Workflow 安装包

[English](workflow-packages.md) · [文档索引](README.zh-CN.md)

面向一般用途的安装包在 [Workflow Package 仓库](https://github.com/TohmaN233/workflow-package)独立维护，目前有 [Answer me with HTML](https://github.com/TohmaN233/workflow-package/blob/main/workflow_explanations/answer-me-with-html.zh-CN.md) 和 [GitHub README generator](https://github.com/TohmaN233/workflow-package/blob/main/workflow_explanations/github-readme-generator.zh-CN.md)。欢迎贡献自己的通用安装包。

下载 `*.workflow-package.json`，再在工作台选择 **安装 Workflow**。JSON 是工作流本体；包仓库的 `workflow_explanations/` 统一保存说明、最终实验结果和产物样例。安装会检查格式、完整性、兼容性和依赖，启动前完成接收端的依赖设置。

新安装的插件库只有 **Build Workflow** 和 **Skill to Workflow** 两个内置工作流；通用包按需导入，不随引擎内置。
