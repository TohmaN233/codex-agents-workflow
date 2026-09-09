# MCP startup repair evidence

The reported thread 01a0840d-6ed3-7540-925f-b808d9865c2b entered starting at 2026-09-09T02:44:40.533Z and failed at .565Z with connection closed during initialize. Waiting was not recovery.

Reproduction: Node 24.14.1 with the installed package and ordinary cwd answered initialize; the same relative script entry with Windows namespaced cwd exited 1 with EISDIR lstat C:. The configured marketplace source uses a namespaced Windows path. The host log does not include child stderr, so correlation to that exact historical exit remains inferred.

Repair: packaged node -e bootstrap normalizes namespaced cwd before resolving/importing the same server; retains direct server signal/drain handling. No replacement task executor.

Hard checks: check-mcp-startup.mjs performs initialize and tools/list, verifies required execution tool names, enforces a 10-second deadline, reports early exit and stderr, and never dispatches a task. verify-control-plane.sh now requires this real handshake; regression covers ordinary and namespaced paths. Independent readiness does not prove host tool exposure or reconnect a failed host session.
