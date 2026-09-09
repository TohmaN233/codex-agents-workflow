# Codex Agents Workflow

A model-configurable workflow plugin with a local console. Build versioned visual Workflows and follow their local execution journal.

The library's **内置协作预设** section includes **多角色协作** and **协作生图**.
A planning subagent works alongside the main agent's tool and input preparation.
After both succeed, the runtime releases production with their structured outputs;
the main agent uses host tools (including image generation) and accepts the result.
Planning uses the registered planning Provider. Production writes use the current
task's output scope; tool discovery and input reads use host permissions. Adding a
preset again opens the existing definition and preserves user edits.

Version0.8.0 introduces the v7 Workflow runtime. Read the [v7 upgrade guide](docs/V7_UPGRADE.md) for migration, execution boundaries and release evidence.

You choose the tasks, the subagent models, and their thinking levels. Plug them in, take them out, add your own, and turn each model connection on or off. Cursor and Grok are extra subagent entries. ChatGPT review uses the installed chatgpt-review-agent skill.

The main agent stays in charge. The bundled review lane defaults to Astra with medium reasoning; Provider bindings are user-owned.

## What the console does

- Turn the whole thing on or off
- Turn each model connection on or off (Cursor, Grok, ChatGPT web review, custom API). All start off. Turning one on does not call it.
- Set a subagent's model and thinking level
- Create, connect, edit, version, copy and delete Workflow graphs
- Import Skills as reviewable Drafts and inspect source updates without changing existing Runs
- Follow real node state, approvals, output previews and exact recovery in the Run view
- Isolate parallel writes in owned Git worktrees and review the integration patch
- Pick which model runs each step of a task

Ask Codex to open the Codex Agents Workflow console, or use the one-click script in the tutorial.

## What stays the same

The main agent owns architecture, routing, verification, and acceptance. Writes require an enabled write capability, a bounded-write stage, and allowed paths. Extra Provider/Stage confirmation prompts are optional and off by default. A subagent cannot swap models or silently fall back.

## Go deeper

The original author writes [**Attention Heads**](https://attentionheads.substack.com/?utm_source=github&utm_medium=readme&utm_campaign=codex-agents-workflow) — deep, evidence-backed writing on AI, cognition, and agentic engineering. [Subscribe](https://attentionheads.substack.com/subscribe?utm_source=github&utm_medium=readme&utm_campaign=codex-agents-workflow) for new Agentic Engineering Field Notes.

## Quick start

You need Codex or ChatGPT desktop with plugins enabled, Node.js 20+, and Git. The POSIX one-liner also uses jq.

~~~sh
codex plugin marketplace add TohmaN233/codex-agents-workflow --ref main
codex plugin add codex-agents-workflow@codex-agents-workflow
plugin_dir="$(codex plugin list --json | jq -r '.installed[] | select(.pluginId == "codex-agents-workflow@codex-agents-workflow") | .source.path')" && test -n "$plugin_dir" && test "$plugin_dir" != null && test -d "$plugin_dir" && test -f "$plugin_dir/scripts/install-agents.mjs" && node "$plugin_dir/scripts/install-agents.mjs"
~~~

Start a fresh task, then use:

~~~text
Use $codex-agents-workflow:workflow-control-plane. Keep the primary agent in charge, read sanitized metadata once, execute a pinned Workflow, and verify actual evidence.
~~~

The native-only workflow remains `$codex-agents-workflow:orchestration`.

For v7 use the [upgrade and Workflow guide](docs/V7_UPGRADE.md). The following tutorials describe legacy v6 settings. Read the [English tutorial](docs/TUTORIAL.md) or [中文教程](docs/TUTORIAL.zh-CN.md) for one-click console scripts, configuration examples, and tests.

Configuration is user-global at `$CODEX_HOME/codex-agents-workflow/control-plane.json` or `~/.codex/codex-agents-workflow/control-plane.json` when `CODEX_HOME` is unset.

## Updating

~~~sh
codex plugin marketplace upgrade codex-agents-workflow
codex plugin add codex-agents-workflow@codex-agents-workflow
plugin_dir="$(codex plugin list --json | jq -r '.installed[] | select(.pluginId == "codex-agents-workflow@codex-agents-workflow") | .source.path')" && test -n "$plugin_dir" && test "$plugin_dir" != null && test -d "$plugin_dir" && test -f "$plugin_dir/scripts/install-agents.mjs" && node "$plugin_dir/scripts/install-agents.mjs"
~~~

For native operations, runtime evidence, and maintainer verification, read [operations.md](plugins/codex-agents-workflow/skills/orchestration/references/operations.md). For connector states and trust boundaries, read [architecture.md](plugins/codex-agents-workflow/skills/control-plane/references/architecture.md) and [provider-contracts.md](plugins/codex-agents-workflow/skills/control-plane/references/provider-contracts.md).

## Attribution

The native selective-routing core was created by Daniel McAteer under the MIT license. The Codex Agents Workflow control plane and minimal connectors are maintained in this repository.
