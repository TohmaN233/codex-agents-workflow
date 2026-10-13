<div align="left">
    <img alt="Codex Agents Workflow icon" src="plugins/codex-agents-workflow/assets/icon.svg" width="80">

<h1>Codex Agents Workflow</h1>

[![MIT Licensed](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](LICENSE)
![verify](https://github.com/TohmaN233/codex-agents-workflow/workflows/verify/badge.svg)

</div>

[Project site](https://tgy233.top/tgypage/caw/) · [Repository](https://github.com/TohmaN233/codex-agents-workflow) · [Author](https://github.com/TohmaN233) · [中文](README.zh-CN.md)

Codex Agents Workflow 1.2 is a local Codex workbench for building, reviewing, installing, and running reusable task graphs. Workflow nodes bind to configured Providers; Roles are separate helper profiles that Main can select for ordinary tasks. The Host schedules Runs and records recovery state, while Main checks results before accepting work.

Generated Workflows use Provider subagents for independent work and the initiating Main conversation for orchestration and semantic acceptance. Main worker sessions and persistent Codex Tasks are optional editor choices. Nodes receive declared inputs and resources; independent work can run concurrently within configured limits. These boundaries can help focus work, but do not guarantee lower cost or elapsed time.

## Requirements

A Codex host with plugin and MCP Extension support, Node.js 20 or newer, and Git.

## Installation

From a clone of this repository:

```sh
git clone https://github.com/TohmaN233/codex-agents-workflow.git
cd codex-agents-workflow
codex plugin marketplace add .
codex plugin add codex-agents-workflow@codex-agents-workflow
```

## Configuration

Native Codex Providers are enabled by default. External Providers and the **Cross-review** and **GPT reviewer** Roles are opt-in; enable each Role and its Provider separately in **Provider settings**.

## Quick start

In a Codex task, open the embedded workbench:

```text
Use $codex-agents-workflow:workflow-control-plane and open the workbench inside Codex.
```

Choose **Build Workflow** to describe a reusable process, or **Skill to Workflow** to convert a pinned Skill. Opening the workbench does not start a Run.

Automatic authoring reviews the result and publishes an enabled, launch-ready Workflow. Inspect its graph, then choose **New task** and enter the goal for a Run. Choose the reviewed-draft option before authoring if you want to accept publication yourself.

## Documentation

- [Documentation index](docs/README.md) — user guide, current architecture, Workflow format, historical experiment results, and the topic coverage map.
- [Optional Workflow packages](plugins/codex-agents-workflow/examples/workflows/README.md) · [Security policy](SECURITY.md)
- [Workflow Package collection](https://github.com/TohmaN233/workflow-package) — opt-in HTML/video and README packages, original Skill credits and comparison notes; maintained separately from plugin defaults.

## Contributor check

To check the browser UI assets, use Node.js 22 or newer in `plugins/codex-agents-workflow/control-plane`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:web
```

## License

[MIT](LICENSE)
