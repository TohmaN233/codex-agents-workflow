## Pause, cancellation and recovery

Use `workflow_pause` to stop new release/dispatch while retaining active completion.
`workflow_cancel` fences the known Run tree before stopping owned executors. Inspect
cancellation-pending evidence; it does not prove remote termination. Connector
permission/input replies use `workflow_control_connector` and exact returned request
IDs/options with actual authorization. Host native/MCP tasks need exact host control.

Read `workflow_get`, `workflow_events` and the original `workflow_run_definition`.
Never recover by selecting the latest task or starting a replacement Run. After
restart, `workflow_resume(after_restart: true)` fences stale leases. An interrupted
unsubmitted claim uses `workflow_recover_claim`; a verified remote connector uses
`workflow_reattach_connector`; a durable closed Strict result uses
`workflow_recover_strict_result`; a pinned child uses `workflow_reattach_subworkflow`.
For native/MCP handoffs, inspect the original task before `workflow_reattach_handoff`;
this is recorded host attestation, not independent connector verification. Exact
reattachment preserves attempt count and never resubmits a model call.

Lost primary controller authority requires the authenticated human console's
explicit tree adoption. Partial recovery errors prevent resume. Use `workflow_retry_node`
only after failure/effect reconciliation and within the pinned retry budget. Inspect
owned orphan/worktree evidence before supported cleanup. Preserve every uncertain
Git-operation marker until the recorded operation and workspace are reconciled.
