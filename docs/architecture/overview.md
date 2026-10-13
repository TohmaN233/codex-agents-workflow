# Current architecture

[Documentation index](../README.md) · [Using guide](../guides/usage.md) · [Workflow schema](../reference/workflow-schema.md) · [中文](overview.zh-CN.md)

Codex Agents Workflow 1.2 separates semantic work from execution mechanics. A Workflow describes a graph of tasks and dependencies. The local Host validates that graph, binds configured executors and resources, schedules ready work, and records Run state. Agents produce task results; Main makes the semantic decisions and checks work before acceptance.

## Skills, Workflows, and the harness

A Skill supplies instructions, references, and sometimes callable code or tools. A Workflow turns a process into declared responsibilities and dependencies. Conversion should retain the Skill's useful behavior and existing tools; dividing work into nodes does not justify removing capabilities or adding unrelated work.

The harness is the environment around the model: tool access, context preparation, the execution loop, state, and checks. This plugin's Host provides the deterministic part of that environment for a Workflow, while agents still make semantic judgments. Skills supply guidance, the graph organizes the process, and the harness executes and observes it; they can work together.

For a growing process, prompt text alone does not isolate later steps or prevent repeated reading and mechanical copying. Delegating to subagents also leaves Main's coordination cost in place if Main keeps polling. Declared context, Host-owned bindings, event waiting, and bounded repair address those specific sources of work. A single bounded action may be simpler as a Skill; performance conclusions still require measurements of the actual task.

## Who does what

| Part | Responsibility |
| --- | --- |
| Main | Receives the user's goal, starts or authors a Workflow, handles semantic decisions, and accepts results after checking the evidence. |
| Host | Compiles and validates graph mechanics, resolves bindings and paths, checks declared requirements, schedules nodes, records events and results, and resumes work from Run state. |
| Provider node | Performs its assigned semantic step using its configured Provider and the inputs and resources projected for that node. |
| Role | Describes a helper Main may select for an ordinary task. A Role is configured separately from a Workflow and is not attached to a Workflow node. |
| Run workspace and journal | Hold task artifacts and the state needed to inspect, continue, or recover a Run. |

The workbench is a local Codex plugin and MCP Extension. Embedded views use the host's available MCP Apps and Extensions capabilities; the standalone browser console uses the same local Host and configuration. See the [usage guide](../guides/usage.md) for installation, launch, settings, and recovery steps.

## Workflow execution

Independent Provider nodes and Main worker sessions receive declared inputs, resources, tools, workspace access, and predecessor results. They do not automatically receive the initiating chat transcript, ambient Skill directories, or another node's raw conversation. Main orchestration retains the initiating conversation, as described below. The Host prepares mechanical fields and result contracts, so a model does not have to invent or copy identifiers, paths, hashes, bindings, and dependency records.

Independent branches or list batches can run concurrently within the configured limits. Nodes write artifacts to their assigned workspace and return a concise status with file references; large outputs and logs stay on disk instead of being repeatedly copied through agent messages. The Host records each node's attempt and result. When one branch fails, completed sibling work remains available for inspection or bounded repair; a failure does not by itself require rerunning every successful branch.

After a handoff, Main can yield while the Host waits for an event. By default, the Host can hold that wait for up to one hour and resumes earlier on an actionable event, including completion, failure, a handoff, or a request for attention. Main does not need to poll the Run on a short interval. Waiting does not remove the time or model work needed by the child executor.

## Main, Providers, Roles, and Threads

Generated independent work uses a configured writable Provider subagent by default. Generated orchestration and semantic acceptance remain with the initiating Main conversation. Main worker sessions and persistent Codex Tasks are explicit editor choices. If a required Provider is unavailable, the Host reports the blocker rather than silently substituting another executor.

A Main orchestration node continues in the conversation that started the Workflow and can use that conversation's available context. A Main worker is an ephemeral fresh session that uses the calling Main's model and receives its declared node materials. A Thread node continues one specific visible Codex task across Workflow stages; it is useful when that task's conversation state must persist and is not the default for ordinary independent work. Current-conversation Main orchestration, a fresh Main worker, and a persistent Thread are three distinct executor choices.

Roles serve a separate path: when an ordinary task has no matching Ready Workflow and a helper would materially help, Main can automatically select an enabled Role. The user does not need to name a Role or start a Workflow. A Role's Provider and enablement are configured independently. Workflow nodes bind directly to Providers and do not inherit Role instructions. See the [official Codex subagent guide](https://learn.chatgpt.com/docs/agent-configuration/subagents) for Codex's own session configuration.

## Authoring and completion

Build Workflow turns a brief into a reusable graph; Skill to Workflow converts a pinned Skill into a Workflow. The Host compiles generated semantic steps and checks the resulting graph and its launch requirements.

Automatic completion is the current authoring default: after review and Host checks succeed, the Host cleans up temporary authoring artifacts and publishes an enabled, launch-ready Workflow. Choosing manual completion retains a reviewed Draft for the user to accept. In either mode, opening the workbench alone does not start a Run.

## Boundaries and evidence

Task-scoped inputs are a context-selection boundary; they do not establish operating-system filesystem isolation. Concurrency and context selection can help focus work, but do not guarantee lower total cost, shorter elapsed time, or a cache hit. The [package comparisons](https://github.com/TohmaN233/workflow-package/blob/main/workflow_explanations/experiments/results.md) report specific tasks, not a general performance promise.

For operational details, see [Providers, Roles, recovery, and configuration](../guides/usage.md). For the supported Workflow fields, see the [schema reference](../reference/workflow-schema.md).

Implementation sources include the [plugin manifest](../../plugins/codex-agents-workflow/.codex-plugin/plugin.json), [generated executor defaults](../../plugins/codex-agents-workflow/control-plane/test/authoring-executor-defaults.test.mjs), [release defaults](../../plugins/codex-agents-workflow/control-plane/test/release-defaults.test.mjs), and [authoring completion policy](../../plugins/codex-agents-workflow/control-plane/lib/skill-import/completion-policy.mjs).
