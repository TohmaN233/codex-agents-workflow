# Workflow schema reference

[Reference index](README.md) · [Documentation index](../README.md) · [中文](workflow-schema.zh-CN.md)

This page documents the user-facing Workflow fields that affect graph structure and bounded repair. The Host remains authoritative: it validates the pinned Workflow before a Run can start.

## Task index and document size

The native task index is currently capped at 16 KiB of serialized UTF-8, including instructions, output schema and JSON escaping. This is a handoff budget, not a limit on a writer's document or generated files. The Host moves large bound inputs intact into verified files and passes their references; it does not truncate the source content. Native input delivery permits up to 8 MiB per input file and 32 MiB per bundle.

Fixed instructions, schemas and reference metadata must still fit the index budget. If they cannot fit after bound inputs move to files, preparation fails visibly. Output content follows its declared schema and artifact contract; there is no universal 16 KiB writing limit.

## Host tool deadlines

Each `host_tools` contract declares `deadline_ms` from 1 through 3,600,000 milliseconds (one hour). The Host runner forwards that pinned deadline to the qualified resource program's command broker, including after executable environment preparation. Ordinary task-program broker calls retain their existing five-minute default unless the Host explicitly supplies a bounded deadline; model command arguments cannot extend it.

Timeout and cancellation still require confirmed process termination and observed effects before a stopped receipt can settle. Failed or unconfirmed execution does not become success or silently retry.

## Automatic Main completion checks

A writable Main orchestration node may attach a mechanical check to its existing completion contract:

```json
{
  "executor": { "kind": "main", "mode": "orchestration" },
  "access": "bounded_write",
  "completion_contract": {
    "on_missing": "block",
    "outcome": "decision",
    "fail_on_false": ["accepted"],
    "host_check": { "tool": "final-check", "success_field": "verified" }
  }
}
```

`tool` names an exact registered contract in the pinned Workflow's `host_tools`; `success_field` names a required boolean in that tool's output schema. Writable ephemeral Main workers and Cooperative native subagents also support this check and require a `correction_field` naming a required string in the tool output. Other Providers, persistent thread, and read-only nodes cannot declare this check. The tool's required input fields are `inputs` and `output`: its schemas must accept the node's projected bindings and declared semantic output. Unknown binding schemas require an unconstrained corresponding tool input; narrower consumers need mechanically provable compatibility. Static node/tool write grants must intersect, and startup checks their effective Run grant before any model work.

The initiating conversation receives a compact check summary in its task bundle and handoff, then submits newly authored semantic output through `workflow_orchestration_complete`. The Host validates semantic output and final acceptance before effects, invokes the existing qualified Host Tool Runner, and supplies the check's pinned resources and verified runtime environment. It then checks workspace effects and required artifacts, including artifacts produced by the check itself. Missing artifacts, false check results, failed commands, stale identities, cancellation, and scope violations prevent acceptance visibly. No additional Main session is started.

An optional `host_check.input_bindings` uses the same bounded binding selectors as node inputs. It binds mechanical completion data separately: the model sees only the node's semantic inputs, while the check receives `{inputs: resolveBindings(host_check.input_bindings, authoritativeRunContext), output}`. Its pointers, schemas, and dependency order are validated with the graph and its actual values are checked before model handoff. Without this map, the existing `{inputs: envelope.inputs, output}` contract remains unchanged. Completion intents and receipts pin the exact Host input digest; a model-visible projection cannot replace it. The binding map itself is omitted from model prompts and handoff summaries.

Each attempt durably pins the check's exact input digest, bounded receipt/output, and a content snapshot of the whole workspace, including Git metadata and directory topology. Repeating completion with the same semantic output reuses a successful receipt only while every snapshotted entry remains unchanged. Changes to scoped products or later creation of a previously missing artifact reject that stale check; final acceptance independently checks freshness inside its transaction. Unreadable files, symbolic links, and snapshot size limits fail visibly. A changed semantic output conflicts with the input pin. An uncertain intent requires explicit reconciliation and never automatically replays, even for a tool otherwise marked safe. Nodes without `host_check` retain normal orchestration completion.

For a Main worker, the Host executes the check after validating its declared semantic result. A false verdict supplies the complete `correction_field` diagnostic to the same ephemeral session for a new result; it does not start a fresh worker or rerun accepted siblings. `retry.max_attempts` bounds these reserved model turns (1–10); source-specific writing or component budgets remain independent. Each check has an exact item/turn execution slot, input pin, receipt and freshness snapshot. Fan-out check bindings resolve Host-side and project the assigned item into the worker's isolated cwd. Mechanical manifests and executable resources need not enter model context. A thrown check or exhausted correction budget fails visibly. Usage includes every dispatched turn; missing transport usage is explicitly unknown and any observed subtotal is labelled partial.

Cooperative native subagents use the same qualified check before item acceptance. Slots bind the exact observed child and terminal turn; false results use the existing recorded-child follow-up, while final join verifies accepted siblings' receipts and freshness. Native usage remains unknown in the Host ledger when its transport cannot attest totals; experiments must attribute every exact child response outside the Workflow. `fanout.workspace_field` selects the checker cwd and narrowed Host grant; it does not control the native spawn API's cwd or impose OS filesystem isolation.

## Native upstream context

`executor: {"kind":"provider", "provider_id":"native-sol", "context_inheritance":"upstream"}` explicitly requests inherited initiating-Main history for Cooperative native subagents. Omitted or `fresh` retains the existing fresh node context. The Host produces `fork_turns:"all"` and omits model/effort overrides because the native API inherits them with full history. The actual initiating Main selection is authenticated and bound before dispatch. Strict or managed-native execution must reject an unsupported inheritance request. Context inheritance shares the parent's existing prefix; it does not promise an exact backend checkpoint, reduced input billing or a cache hit. Keep common semantic references upstream once and child packets limited to their assigned work.

## Executable dependencies at a selected node

Workflow-level `requirements.executables` remains the unconditional startup contract. An executable node (`agent`, `tool`, `skill_ref` or `subworkflow`) may add dependencies needed only when that node becomes ready:

```json
{
  "id": "export_mp4",
  "runtime_requirements": {
    "executables": [{ "name": "node", "version": ">=22" }, "ffmpeg", "chrome"],
    "source_requirement_ids": ["source_mp4_node", "source_mp4_ffmpeg", "source_mp4_chrome"]
  }
}
```

`executables` is a nonempty array using the existing logical name/version/Python-module descriptors. `source_requirement_ids` is an optional array of unique stable source IDs. Unknown fields, commands, paths and conflicting version intersections fail validation. Keep this declaration on the actual exclusive consumer; a shared router or general video activity would impose its requirements on every request reaching that activity. A global Node 20 minimum can therefore coexist with a Node 22 MP4 export requirement, while ordinary HTML requests need no FFmpeg or Chrome.

Before claim and dispatch, the Host prepares the intersection of the global and selected-node requirements using the existing discovery, registry and verification mechanisms. Missing dependencies produce durable attention identifying the node, source IDs and scope hash before its executor starts. Registration and `recheck_runtime_environment` resume that requesting scope. Installation still requires human approval; no model availability-check node is needed. The Run journal stores verified paths and generation separately for each node. The claim pins the exact scope and executable-path digest; changing those paths during an admitted attempt fails visibly before dispatch. Global rechecks preserve these bindings. Newly created Main worker, managed native and Strict sessions, and native Host resource program brokers receive the scoped process environment. Their shared PATH construction orders executable directories so native logical-name resolution matches every resolvable binding; incompatible directory order or working-directory shadow fails with `ENVIRONMENT_BINDING_STALE` before dispatch. A physical alias such as `chrome` bound to `google-chrome` retains its absolute program binding without inventing a PATH alias. Current Main orchestration and cooperative native children receive authoritative scoped tool locations, but their existing process environment and arbitrary shell resolution cannot be changed by the Host. This native environment forwarding does not add WSL environment support; an incompatible explicit WSL environment fails visibly.

Conditional source compilation additionally requires an explicit mapping `runtime_activation: {"condition_node_id":"export_route","branch_label":"导出 MP4"}`. The Host verifies the original branch edge, source executable/version/module evidence, and that the condition dominates every mapped consumer while all other branches cannot reach them. Only then does it emit the node declaration and mark that conditional dependency compiled. Existing prose guards, shared consumers, and artifact-only phases remain visibly agent-assisted with an unbound-preparation reason. The current semantic planner ABI does not infer this typed activation; authors may provide the canonical mapping or a reviewed explicit node declaration. Portable dependency details and source phases survive conversion export; local paths and probe evidence remain Host state.

## Bounded repair loops

Declare repeated review and repair as a Workflow-level `loops` array. A loop names a region in the existing node graph; it does not add a back edge. The graph remains a DAG, and only the named region repeats.

In the Workbench, open **Workflow properties** in the canvas inspector and use **Repair loops** to add a region. Choose its entry node, exit node, member nodes, and round limit. The canvas outlines the region and shows a round badge. A simple boolean JSON Pointer can define the stop condition; the existing condition DSL and feedback binding map are also available in advanced JSON fields. Item-level scope has form fields for item selectors and path fields, with advanced selector JSON available when needed.

```json
{
  "loops": [
    {
      "id": "review-repair",
      "entry_node": "route",
      "exit_node": "review",
      "node_ids": ["route", "repair", "review"],
      "max_rounds": 4,
      "until": {
        "op": "eq",
        "args": [
          { "path": "/loops/review-repair/all_accepted" },
          { "value": true }
        ]
      },
      "feedback_bindings": {
        "findings": "/nodes/review/output/verdicts"
      },
      "item_scope": {
        "items": "/inputs/items",
        "verdicts": "/nodes/review/output/verdicts",
        "paths_field": "files",
        "dependencies_field": "dependencies"
      }
    }
  ]
}
```

Each entry has these fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable, unique identifier for this region. |
| `entry_node` | Node where a round enters the region. |
| `exit_node` | Boundary where the Host evaluates whether to accept or repeat a round. Agent and SkillRef exits use independent review contexts; access is a separate Run-bounded authority. A condition exit preserves its selected branch. Item acceptance requires an executed review with explicit access. Keep semantic rejection in the structured result; a false semantic verdict is not an execution failure. |
| `node_ids` | Explicit members of this region. The entry and exit nodes belong to the region. |
| `max_rounds` | Positive round bound, including the first review iteration. This is a per-region repair bound, separate from a node's local retry budget. |
| `until` | A boolean condition using the existing Workflow condition-expression DSL. When true, the loop can leave its region. The loop context exposes its `feedback` and `all_accepted` values under `/loops/<id>/...`. |
| `feedback_bindings` | Optional named selectors stored under `/loops/<id>/feedback/<name>`. Repair nodes read these values through their input bindings. Selectors use the existing JSON Pointer or bounded selector forms. |
| `item_scope` | Optional contract for item-level review and repair, described below. |

With `item_scope` declared, the first review receives all scoped items and the first repair input is empty. Later rounds send only failed original items with their latest findings to repair. The Host keeps the original item records immutable; findings are attached to the projected repair input for that round. Accepted items remain in history. Review covers failed items and accepted items whose dependent shared files changed. The Host invalidates only acceptance affected by those changes, so already-good items are not rewritten needlessly.

`item_scope.items` and `item_scope.verdicts` use the same selector form as Workflow input bindings. `paths_field` names an array field in each original item that lists its artifact paths. `dependencies_field` is optional and names another array field containing dependency paths. The Host uses these relationships to determine which accepted items need another review after shared files change.

When the reviewer fans out over `review_items`, its source list must be nonempty. The Host checks known inputs before launch and generated inputs when the region activates, before dispatching a reviewer.

The Run view shows each region's status and round, with its stored loop state available for inspection. If a loop reaches `max_rounds` before acceptance, the Run fails. The Host never accepts an unreviewed result from an exhausted final round. The loop's round count is not a global Run hard limit; ordinary node retries and independent regions keep their own bounds.
