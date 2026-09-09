# MCP startup and upgrade lifecycle

A real Codex host reproduces the repeated connection-closed failure: start an ephemeral thread, upgrade the plugin through the CLI while the host remains alive, then start another thread. The installer removes old version contents, while that host still caches its MCP cwd and arguments. Independent probing of the new directory passes and does not diagnose this lifecycle. MCP reload alone does not invalidate the cached plugin catalog in the tested host.

The bootstrap now resolves `codex plugin list --marketplace codex-agents-workflow --json` on every handshake and validates the exact enabled installed identity. It never chooses the greatest cache-directory name. Its cwd is the stable cache parent, and bootstrap code is embedded in the MCP configuration so deleting an obsolete revision cannot remove the bootstrap. Startup resolution and errors are recorded in the user-data `mcp-startup.jsonl` without credentials.

Run `node scripts/build-mcp-entry.mjs` after editing `scripts/mcp-bootstrap.cjs`. Local upgrades use `node scripts/install-local.mjs`: retain files needed by live hosts, install through the official CLI, verify retained bytes, then replace retired server entrypoints with explicit current-registry bootstrap bridges. Existing running processes are not killed. Cache cleanup protects those compatibility entrypoints by PID plus start-time identity until their host exits. These are compatibility entrypoints, not a choice to run old logic.

Validation: `node scripts/check-upgrade-lifecycle.mjs` starts a real Codex app-server with an isolated home, installs a synthetic plugin, upgrades it while the same host lives, and asserts a new ephemeral thread connects to the new registered version. It does not invoke a model. `check-mcp-startup.mjs` remains only a standalone protocol check; its `host_tool_exposure: not_checked` must not be interpreted as desktop readiness.

The earlier Windows namespaced-path reproduction remains useful but did not cover this root cause. Do not conclude that waiting or repeating MCP reload will fix a cached deleted entrypoint.
