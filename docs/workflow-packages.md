# Workflow packages

[中文](workflow-packages.zh-CN.md) · [Documentation](README.md)

Generally useful packages are maintained in [Workflow Package](https://github.com/TohmaN233/workflow-package), separately from this engine. Currently available: [Answer me with HTML](https://github.com/TohmaN233/workflow-package/blob/main/workflow_explanations/answer-me-with-html.md) and [GitHub README generator](https://github.com/TohmaN233/workflow-package/blob/main/workflow_explanations/github-readme-generator.md). Contributions are welcome.

Download a `*.workflow-package.json`, then choose **Install Workflow** in the workbench. This JSON is the Workflow body; the collection's `workflow_explanations/` contains all instructions, final comparisons and output examples. Installation checks format, integrity, compatibility and dependencies; complete the receiving host's dependency setup before launch.

A fresh plugin library contains only **Build Workflow** and **Skill to Workflow**. Collection packages are opt-in and are not bundled with the engine.
