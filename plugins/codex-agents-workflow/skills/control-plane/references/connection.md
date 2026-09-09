# Connection diagnosis

Inspect `mcp-startup.jsonl` in the plugin user-data directory and host startup logs.
The bootstrap resolves the currently registered installation at each handshake.
An older host may retain an obsolete entrypoint; the supported
`scripts/install-local.mjs` update restores compatibility entrypoints. MCP reload
alone may retain the host's old plugin catalog. Do not repeat an ineffective reload
or retry a deterministic process exit by sleeping.

Report the failed call and diagnostic evidence. A Workflow validation blocker
means the connection works. Never claim connection recovery before a host tool call
succeeds, or start a substitute server and claim the Workflow ran.
