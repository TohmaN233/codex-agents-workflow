# Maintainer Rules

## Working standard

- Fail visibly. Do not hide errors with fallback success, guessed identities, silent retries, or substituted execution paths.
- Fix the shared cause and add a mechanical regression. Do not patch one generated Workflow when the compiler or runtime contract is wrong.
- Keep execution observable through bounded journal events and exact diagnostics. Never persist secrets or large model output as diagnostics.
- Do not break the main branch. Use an isolated branch for broad changes.

## Current execution architecture

- `workflow_start` launches one Host-owned Run. Deterministic nodes and logical Main nodes run under the detached Host owner.
- Cooperative Provider nodes use real native Codex subagents. The controller performs only the returned spawn or follow-up action; the Host owns Run IDs, node IDs, leases, task names, Agent paths, hashes, item positions, receipts, and completion.
- The public native continuation surface is exactly `workflow_native_next`, `workflow_native_spawned_batch`, and `workflow_native_followed_up`. The latter two take no arguments.
- After spawn acknowledgement, the same Host call waits for child lifecycle events for up to one hour. It wakes on a child event, Host failure, cancellation, attention, or timeout. The model must never poll Run state or call `wait_agent` on a timer.
- Host heartbeat checks are internal and cannot release another model turn. Host startup or observation failure must become a visible Run failure.
- Native completion comes from the exact child rollout and exact completed turn. Never choose a latest or same-named task, infer a parent from `main_actor`, or accept a manually copied result.
- `thread` remains a supported explicit executor for persistent user-visible Codex tasks. Generation may select it only from an explicit same-Provider task lineage. Default Agent execution and ordinary fan-out use native subagents.
- Logical Main inherits the calling chat's current model and reasoning selection. Standalone Workbench tasks inherit the user's Codex settings. There is no fixed plugin Main model or effort, and these selections never enter exported Workflow nodes. Explicit isolated experiments may select their own Main settings.

## Models and roles

- Routine bounded implementation uses GPT-6 Luna / max. Complex implementation, repository analysis, and independent review use GPT-6.1 Sol / high. Planning, brainstorming, and focused problem solving use GPT-6 Astra / medium.
- The built-in native Provider registry has exactly three model connections: `native-luna` (GPT-6 Luna / max), `native-sol` (GPT-6.1 Sol / high), and `native-astra` (GPT-6 Astra / medium). Planning, implementation, solving, and review behavior belongs to editable Roles and Workflow nodes rather than duplicate Providers.
- Retired purpose-specific Luna, Terra, Astra, and generation-reviewer Provider IDs are accepted only by configuration and stored-Workflow migration boundaries and are immediately canonicalized. Runtime validation rejects them.
- Workbench Roles are the only plugin Role registry. When no Workflow matches, Main automatically selects an enabled Role, compiles its current Provider adapter, and assigns the helper without requiring the user to name it.
- Built-in connector Roles launch through `workflow_start_role_connector`; the Host resolves the pinned Role and delivers its instructions directly, without a legacy Task Type or Workflow Run. Connector status/control keep the returned exact task identity.
- Main continues independent work, then uses one event-driven wait with the longest supported timeout and verifies the helper result after wakeup. Do not poll.
- Workflow Providers use the generic `default` native agent with an explicit model and effort. Workflow nodes never pin or inject Workbench Role instructions; generated nodes retain only their Provider and node task.
- Fresh context excludes unrelated conversation and Skill instructions. It must retain normal Codex reading, image, shell, editing, search, and task-relevant tools.

## Inputs, prompts, and context

- Prefer `inputs_path` for an existing structured input packet. Relative and absolute paths are both valid only when they resolve inside the Run workspace.
- The Host reads, hashes, and validates input files. Never ask a model to copy IDs, paths, hashes, tokens, indices, revisions, receipts, timestamps, labels, unchanged metadata, or arbitrary unchanged fields.
- Generated Ready Workflows must pass the same no-transcription validator used by Skill2Workflow and Build Workflow.
- Context projection is declared-only: exact `input_bindings` and pinned resources. Do not expose full Workflow inputs, ancestor outputs, project memory, or ambient history through compatibility projection.
- Native packets contain the workspace, allowed write paths, and one Host-generated local task-bundle path. The child reads that bundle once and writes directly in the workspace.
- Keep task prompts concise and semantic. Do not disable ordinary Codex abilities or restate Host-owned protocol fields in prose.
- Project-memory files are never required product artifacts.
- Do not add experimental token measurement to Workflow nodes, prompts, completion contracts, or runtime behavior. Experiments measure usage externally from Codex history.

## Fan-out and repair

- Default Agent retry is three total attempts unless the source explicitly requires another bound.
- Runtime fan-out uses Host-generated deterministic assignments. `batch_size` controls items per child; `max_concurrency` controls active children.
- Parallel bounded-write children must have disjoint Host-derived write paths. Shared changes go to one downstream integration owner.
- With `result_mode: per_item`, the Agent returns semantic entries in supplied order. The Host binds them to original items and journals each accepted entry.
- A failed item never replays accepted siblings. Same-child repair receives only unresolved items. An outer retry inherits accepted item results.
- Incremental delivery uses the exact completed turn and only the next unresolved item, on both native paths. Recovery replays an undelivered journaled packet before observing another turn. Successful item advancement does not consume the failed-turn retry allowance. An empty inherited pool still validates the full join and releases the successor without a child invocation.
- Assignment indices stay tied to the original partition after inherited partitions are removed. Child input and write scope contain only unresolved items; result joins and evidence hashes contain the complete original partition, including inherited results.
- A malformed or blocked child result consumes only that child or node's declared retry allowance. Exhaustion fails visibly.
- Agent finals are small semantic results. Files and detailed evidence remain local; a child reports completion and concise evidence rather than returning file contents.

## Authoring and portability

- Skill2Workflow and Build Workflow share the same semantic planner, deterministic Host compiler, independent review, and Ready validation.
- Models author semantic intent only. The Host creates graph IDs, JSON pointers, bindings, Provider assignments, permissions, packet identities, hashes, and package metadata.
- Semantic review findings receive targeted patches. Mechanical compiler, schema, dependency, permission, and identity failures stop without spending another model attempt.
- Explicit persistent task lineage may compile to `thread`; all other Agent stages default to registered native Providers.
- Runtime dependency preparation is Host-owned step 0 for every Workflow. Workflows declare logical executable names and portable version/module constraints only.
- Codex executor compatibility depends on the selected executable's required protocol capabilities, never a shipped OS, architecture, version or universal binary-hash allowlist. Keep the actual local executable identity and fail on a change during an owned attempt; platform-specific optional adapters must not block unrelated executors.
- Unavailable dependencies or obsolete tool identities affect the requesting Workflow. Report its diagnostic without preventing the Workbench from opening or unrelated Ready Workflows from running.
- The Host searches registered paths, PATH, common local installations, and explicit directories. If none satisfy the declaration, it asks for installation approval. A stale binding follows the same discovery and registration path before node effects.
- Actual dependency paths and probe evidence live in the Host registry and Run journal. They are never exported in Workflow packages.
- Export only current content-addressed package format. Validate graph, resources, dependency manifest, revision hash, and package hash before atomic installation.
- Local plugin installation overwrites the current plugin-owned files and removes retired role files. Do not create backup plugin versions or automatic rollback copies.

## Permissions and artifacts

- `read_only` and `bounded_write` select the native sandbox. Run and node scopes still enforce exact output paths.
- Bounded write limits outputs, not task input reads or executable discovery.
- Preserve user files and concurrent edits. Do not write outside the exact Run scope.
- Required outputs and source-location evidence are validated before downstream release.
- Command output is captured by the Host without silent truncation. A limit or failed termination is an explicit tool failure.
- Native task execution owns the normal task process tree through completion or cancellation. POSIX groups are stopped and inspected before quiescence is reported; a direct parent's close is insufficient while live descendants remain. Unconfirmed termination retains ownership and prevents competing execution.

## Release validation

- Find path, hash, dependency, schema, Provider, prompt, permission, and handoff defects mechanically before starting a Workflow Run.
- Run the complete control-plane test manifest and the installer/packaging verification after runtime changes.
- Tests support the declared Node minimum and use portable local fixtures. Real integration dependencies are provisioned explicitly by CI; release versions come from matching package and plugin metadata.
- CI runs the complete manifest once on each of Windows, Linux and macOS. Repository checks run independently with `--static-only`; local verification scripts run the full manifest by default. Static checks use standard shell tools rather than requiring ripgrep.
- A Workflow Run starts only from a Ready, launchable, hash-consistent package with all runtime dependencies resolved.
