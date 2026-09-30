---
name: workflow-control-plane
description: "Keep the host Workflow plane available, route concrete execution tasks to matching Ready Workflows, and manage Workflows on request. Do not start Runs for planning, discussion, comparison, audit, or experiment design."
---

# Workflow control plane

The plugin host is the persistent control plane, available without a matching
Workflow. A Workflow is an end-to-end graph for a task intent. A Role
assigns one helper during ordinary work and is handled by the orchestration skill;
it does not start a Workflow Run or enter a running Workflow node.

A failed Run is an unfinished user task. Treat `completion_satisfied:false` or
`recovery_required:true` as a recovery signal: inspect the exact failed node and
retained evidence, repair the Workflow or use an allowed targeted retry, and run
again. Report task completion only after the required final node makes the Run
`succeeded`.

## Route the request

- **Execute:** a concrete task matches a Ready Workflow. For an unpinned task,
  call `workflow_route` with the concrete task. It returns compact valid Ready
  candidates, not prompts or the library. Start the selected candidate
  automatically when there is one clear semantic match. If candidates differ
  materially in outcome, permissions or side effects, ask the user. Do not
  select by keyword overlap alone. If none fits, continue ordinary work and let
  the orchestration skill choose an enabled Role automatically when delegation helps.
- **Manage:** create, import, inspect, debug, edit, publish, install or export a
  Workflow. Read [editing](references/editing.md) and use only the requested path.
- **Meta:** planning, comparing, auditing, evaluating, or designing experiments
  about Skills or Workflows. Work directly. Merely mentioning this plugin is not
  permission to start a Run.

When the host already supplies an exact Ready Workflow ID/revision or a node
`agent_packet`, do not list, route, inspect, or reload the Workflow. The host
has already selected it. Only the current validated Ready revision may be
automatically routed; Drafts, retired Role graphs, previous revisions and
conversion history are not execution context. `workflow_list` is an explicit
management operation, not the startup or execution routing path.

## Execute a selected Workflow

Call `workflow_start` with the selected Workflow, task and absolute workspace. Pass
existing structured local inputs with `inputs_path`, or pass only the scalar local
address expected by a registered Host tool. Never open a manifest or data file and
copy its fields into `inputs`; the Host rejects nested model-transcribed inputs.
Host step 0 verifies and registers dependencies. Missing dependencies are
reported before execution; ask before installing them.

The Host advances deterministic and logical Main work. At a cooperative native
node, follow the returned `workflow_native_next` packet and launch its exact
`spawn_config` plus `prompt` with `spawn_agent`; never replace it with a task thread. The Host
materializes one local task bundle as a bounded index plus exact Host-written input,
resource and verified-file sidecars. Large file
contents never share the single-read index.
Spawn every packet in the released concurrency window, then call
`workflow_native_spawned_batch` once with no arguments.
That call blocks in the Host until an Agent event or the one-hour limit; follow its returned action.
Do not poll the Run or add a Main wait.
For `continue_recorded_agent` or `repair_recorded_agent`, call `collaboration.followup_task`
with the exact `followup_config`, then call `workflow_native_followed_up` with no arguments.
Host retains receipt identity and waits for the Agent event. This is the
Host-controlled per-item continuation path: it reuses the same native Agent while
releasing only unresolved input. Never combine later items by hand or replay an
already accepted item.

Converted and built Workflows must not make any Agent hand-copy unchanged
input or resource values. This applies to arbitrary records, labels, names,
source text and metadata as well as IDs, paths and hashes. Bind the original
value directly beside the Agent's newly created semantic result, or use an
exact registered Host tool to copy, transform or join it. The authoring
compiler rejects copy-through instructions and Agent outputs that reuse a
Host-owned identity or location fields.
For fan-out writers with per-item path scopes, the complete task packet must
bind directly from a Workflow input or an exact registered Host tool. The
compiler rejects an Agent-produced packet before the Workflow can become Ready,
including when a Host tool wraps or joins an upstream Agent output.

The Host owns launch, node claims, identities, leases, receipts, context
projection, completion envelopes, retries and continuation. Each logical Main
node gets a fresh compact session with declared inputs, resources and scoped
tools. Return only values in its supplied response schema. The initiating Main
agent should not poll or reason while the Host owns the wait.

A converted Workflow is a self-contained replacement for its source Skill.
Runtime must not read the original Skill, copied `SKILL.md`, ambient Skill
instructions or conversion history. Necessary scripts and references are
Workflow-owned assets. If a Run requests a source Skill path, report a defective
package rather than loading it.

Unavailable tools: read [connection diagnosis](references/connection.md).
Open requested UI with `codex_agents_workflow_app` or `codex_agents_workflow_settings`;
views create no Run/thread. Use `codex_agents_workflow_console` for standalone
requests or unsupported App hosts. Report App errors; no silent console fallback.
App transport/bootstrap stay out of model/node context. Never invent Run receipts.
