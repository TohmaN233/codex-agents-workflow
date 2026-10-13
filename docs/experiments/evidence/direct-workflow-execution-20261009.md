# Typed direct Workflow execution

The r13 retry's Main submitted three 1000ms outer Code Mode budgets despite
receiving 3600000ms executable adapters. Recorded tool input proves adapter
non-adoption; it does not prove whether the model or a transport rewrite authored
that source. Plugin tool descriptions cannot mechanically set the outer
`functions.exec`/`functions.wait` scheduler budget.

The native Codex plugin binds each MCP server to its invocation transport. The
`codex-agents-workflow` management server retains its historical tools and sets
`WORKFLOW_MCP_TRANSPORT=code_mode`. The dedicated `caw-execution` server sets
`WORKFLOW_MCP_TRANSPORT=direct_mcp`, permits the six long execution tools plus
`workflow_startup_contract`, and sets `omit_tools_from:["code_mode","deferred"]`. Both use
the same portable bootstrap and the existing 3660s inner MCP RPC timeout. The
short namespace `mcp__caw_execution__` keeps every qualified tool name within
64 characters. No global Code Mode default or namespace configuration changes.

The service selects one immutable descriptor family from its launcher. An
untagged historical launcher retains `code_mode`; unknown values fail before
serving. Catalog descriptions, capabilities, startup and every continuation use
that same selection. Direct descriptors retain the `invocation_adapter` field
and operation names while moving to schema version 2:

```json
{
  "schema_version": 2,
  "kind": "direct_mcp",
  "tool_name": "workflow_start_prepared",
  "tool": "mcp__caw_execution__workflow_start_prepared",
  "arguments": { "startup_reference": "12345678-1234-4234-8234-123456789abc" },
  "slot": "none",
  "scope": "direct_mcp_only"
}
```

Typed startup carries only its opaque preparation UUID. Untyped startup uses
the same fixed argument plus `slot:initial_output` and its actual public slot
schema. Ordinary startup retains the Host-generated launch UUID. Native batch
acknowledgement retains the exact Host batch ID with `slot:none`. Generic
continuations expose only their public business argument schema; orchestration
completion exposes the semantic `output` value. The unchanged public schemas,
sealed preparation records and authenticated controller/lease/child ownership
still validate the actual submission. The descriptor contains no executable
source, pragma or cell-resume parameters. An unavailable direct tool is an
explicit missing interface; there is no automatic fallback.

Standalone code-formatting APIs (`workflowCallInvocation`,
`workflowCallArguments`, `workflowOrchestrationInvocation`, `workflowCallResume`)
remain for old external integrations. Their explicit
`workflowLegacy*AdapterDescriptor` exports retain schema version 1 and the old
management namespace. The management launcher returns those descriptors with
the existing fixed one-hour exec/resume configuration. The direct launcher
returns typed descriptors without executable source or timing parameters.
This is a launcher binding; models cannot select transport or silently fall back.

New preparation records use sealed schema version 2 and retain their selected
transport. Startup resolution rejects a different launcher before creating a
Run. Historical schema version 1 records retain their original code-mode
contract and cannot be submitted to the direct launcher. Changing the plugin
files does not prove the Desktop has reloaded its parsed MCP registration;
qualify the actual initiating interface after an app-owned reload or restart.

The inspected public Codex source accepts the omission field through the native
`.codex-plugin/plugin.json` + `.mcp.json` loader. Standard Agent Plugins
`mcp.json` rejects that extra field. Pinned source also contains an optional
strict third-party Code Mode policy that can override server omissions and force
tools to Deferred. The current registered binary accepts the field and rejects
invalid enum values in a zero-model disabled-server parser probe; that proves
parser support, not Desktop effective policy or business-call exposure. Direct
exposure, installed bytes, business quality, total cost and wall time require
their separate qualification. Source pins and probe output are saved in
`G:/Baiduyun/r13-main-exposure-diagnosis-20261009/evidence.json` and `REPORT.md`.
