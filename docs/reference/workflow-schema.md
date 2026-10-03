# Workflow schema reference

This page documents the user-facing Workflow fields that affect graph structure and bounded repair. The Host remains authoritative: it validates the pinned Workflow before a Run can start.

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
| `exit_node` | Boundary where the Host evaluates whether to accept or repeat a round. Agent and SkillRef exits use independent read-only review. A condition exit preserves its selected branch. Item acceptance requires an executed read-only review. Keep semantic rejection in the structured result; a false semantic verdict is not an execution failure. |
| `node_ids` | Explicit members of this region. The entry and exit nodes belong to the region. |
| `max_rounds` | Positive round bound, including the first review iteration. This is a per-region repair bound, separate from a node's local retry budget. |
| `until` | A boolean condition using the existing Workflow condition-expression DSL. When true, the loop can leave its region. The loop context exposes its `feedback` and `all_accepted` values under `/loops/<id>/...`. |
| `feedback_bindings` | Optional named selectors stored under `/loops/<id>/feedback/<name>`. Repair nodes read these values through their input bindings. Selectors use the existing JSON Pointer or bounded selector forms. |
| `item_scope` | Optional contract for item-level review and repair, described below. |

With `item_scope` declared, the first review receives all scoped items and the first repair input is empty. Later rounds send only failed original items with their latest findings to repair. The Host keeps the original item records immutable; findings are attached to the projected repair input for that round. Accepted items remain in history. Review covers failed items and accepted items whose dependent shared files changed. The Host invalidates only acceptance affected by those changes, so already-good items are not rewritten needlessly.

`item_scope.items` and `item_scope.verdicts` use the same selector form as Workflow input bindings. `paths_field` names an array field in each original item that lists its artifact paths. `dependencies_field` is optional and names another array field containing dependency paths. The Host uses these relationships to determine which accepted items need another review after shared files change.

When the reviewer fans out over `review_items`, its source list must be nonempty. The Host checks known inputs before launch and generated inputs when the region activates, before dispatching a reviewer.

The Run view shows each region's status and round, with its stored loop state available for inspection. If a loop reaches `max_rounds` before acceptance, the Run fails. The Host never accepts an unreviewed result from an exhausted final round. The loop's round count is not a global Run hard limit; ordinary node retries and independent regions keep their own bounds.
