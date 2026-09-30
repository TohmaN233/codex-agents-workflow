# Using Codex Agents Workflow

[README](../README.en.md) · [中文教程](TUTORIAL.zh-CN.md)

This guide matches the current release workbench. It starts from the two default authoring Workflows and covers Roles, Providers, Skill conversion, optional packages, execution, and recovery.

## 1. Install and open the workbench

Follow the [README quick start](../README.en.md#quick-start), then restart the Codex desktop app to load the entrypoints. The workbench now uses a Codex MCP Extension: supported hosts expose an embedded workbench and a separate settings entry. You can also ask in your current Codex task:

```text
Use $codex-agents-workflow:workflow-control-plane and open the workbench inside Codex.
```

The workbench and Provider settings are MCP App views; opening them does not start a Workflow. When the composer supports mentions, search and reference a Workflow or Role. A reference supplies compact context, not permission to execute. The UI bridge calls the existing Host, and full configuration stays out of the model-visible opener result. Optional features depend on the host's negotiated capabilities.

The embedded view needs no manual HTTP server, port, or authentication URL. It shares the Host, user configuration, and Run records with the browser console; switching interfaces does not require reinstalling Workflows.

For a standalone browser page, or a host without embedded-view support, explicitly launch it from the clone:

```powershell
.\plugins\codex-agents-workflow\scripts\open-control-console.cmd
```

```sh
sh plugins/codex-agents-workflow/scripts/open-control-console.sh
```

The Windows launcher follows Codex's installed-plugin record. The macOS/Linux script starts the workbench from the current clone. Keep the terminal process running and do not share the tokenized loopback URL.

A fresh library contains only two Workflows: **Build Workflow** and **Skill to Workflow**. Roles appear in their own section instead of being mixed into the Workflow list.

![Current workflow library](assets/tutorial/workbench-library.png)

## 2. Understand Providers, Roles, and Workflows

| Object | Purpose | Creates a Run |
| --- | --- | --- |
| Provider | Connects to a model or external execution endpoint | No |
| Role | Tells Main how to call one helper, including its task rules, access, and Provider | No |
| Workflow | Defines a multi-step task graph with dependencies and completion rules | Yes |

Once the plugin is loaded, Main automatically selects an enabled Role when an ordinary task benefits from delegation. The user does not need to name a Role or start a Workflow. Main first continues work that does not depend on the helper, then enters an event wait of up to one hour. Completion, failure, or a request for input wakes Main, which inspects the actual changes and verification evidence.

For a Role using a built-in connector such as Grok, the Host launches the selected published Role directly through `workflow_start_role_connector`. It compiles and delivers the current instructions without requiring a legacy Task Type or creating a Workflow Run. The returned task identity is used for status and cancellation. Native Roles use the returned native spawn configuration; GPT reviewer uses the configured packet review route.

Workflow nodes do not reference or inject Roles. A node stores only its Provider, task, inputs, and access. Workflow generation may choose a Provider by task type; runtime does not stack a Workbench Role on the node.

Release defaults:

- Native Codex Providers are enabled.
- External Providers are disabled.
- Cross-review is visible but disabled.
- GPT reviewer is visible but disabled and reuses the existing `chatgpt-web-pro` Provider.
- Math, Zenonzard, and video-use are not installed automatically.

A disabled Role is not selected for delegation. A disabled Provider is never silently replaced: dependent Workflows may be saved and installed, but cannot launch until that Provider is enabled.

## 3. Configure Providers and Roles

Open **Provider settings** from the top navigation.

### Native Providers

Native Providers use the model catalog available to the current Codex login. After choosing a model, the UI lists only supported reasoning efforts. Roles express implementation, analysis, review, and similar behavior, so the same model/effort connection does not need to be duplicated for every purpose.

Main uses the calling chat's current model and reasoning selection. A standalone Workbench launch uses the user's Codex settings. Workflow nodes and exported packages do not specify a Main model.

### External Providers

External Providers start disabled. Enable one only when needed, then configure its endpoint, model, and authentication. A session API key has a dedicated input and is not stored as an ordinary configuration value. `chatgpt-web-pro` uses the installed `chatgpt-agent` Packet route; GPT reviewer reuses this one connection after it is enabled.

Saving Provider settings does not call a model.

### Edit a Role

Click a Role card in the library to change:

- enabled state;
- Provider binding; model and reasoning effort are configured on the Provider;
- read-only or bounded-write access;
- behavior instructions.

Cross-review binds to `grok-local`; GPT reviewer binds to `chatgpt-web-pro`. Both Roles and their Providers are disabled in release defaults. Enable the Role and its corresponding Provider before using it.

## 4. Build a Workflow from a brief

Open **Build Workflow**, choose **New task**, and describe the process you want to make reusable rather than the answer to one temporary run.

A useful brief states:

- the Workflow goal and final artifacts;
- required ordering;
- work that is truly independent;
- decisions that require human confirmation;
- local files, tools, or services it depends on;
- completion criteria and the correct recovery point after failure.

Authoring agents return semantic nodes and constraints. The Host generates node IDs, edges, schemas, bindings, hashes, dependency manifests, and deterministic pre-publication checks. Do not ask a model to transcribe random IDs or encoded fields.

The result is an editable draft. Review the graph and properties before saving, validating, and publishing.

## 5. Convert a Skill into a Workflow

Choose **Import from Skill** in the library:

1. Scan the default Codex Skill folders or choose the folder containing the target Skill.
2. Verify its name, location, and source version, then choose **Import this version**.
3. Open **Import review** and inspect source material, resources, dependencies, and conversion state.
4. Start the Skill to Workflow authoring process.
5. Review generated nodes, edges, human gates, and source-requirement mappings.
6. Accept the result as a normal editable draft and adjust it for the real execution environment.

During review, check that:

- hard rules and acceptance criteria from the Skill survived conversion;
- only genuinely independent work runs in parallel;
- predecessor results reach only the nodes that need them;
- human approval occurs before the relevant external effect;
- required reading, writing, image, coding, and tool capabilities remain available;
- machine-specific absolute paths became Run inputs or portable dependencies.

Import does not modify the source Skill or execute its business task. Publishing the generated Workflow does not start a Run.

## 6. Install an optional Workflow

Installable Math, Zenonzard, and video-use packages live in:

```text
plugins/codex-agents-workflow/examples/workflows/
```

Choose **Install Workflow** and select a `*.workflow-package.json` file directly. Installation validates format, content hashes, compatibility, and dependency declarations. It neither launches the Workflow nor silently installs missing software.

If an installed Workflow is not launch-ready, check:

- whether required Roles are enabled;
- whether bound Providers are enabled and available;
- whether declared tools and services exist locally;
- whether this Run supplies its actual source directory or workspace.

### The two export formats

- **Full Pack snapshot** contains the complete editor revision and resources. It is intended for audit and diagnosis and may include private conversion material.
- **Install package** contains compatibility, dependency, and integrity manifests while excluding private source material. Use this format on another computer.

Do not bake the author's machine-specific asset paths into a portable Workflow package.

## 7. Edit, save, publish, and run

Opening a Workflow shows the current canvas:

![Current Workflow canvas](assets/tutorial/workbench-editor.png)

Add nodes from the left, edit edges in the canvas, and change Workflow or node properties on the right. The top tabs expose resources, import review, versions, full IR, and Run settings.

### Set subagent count and concurrency

Select an **Agent node** on the canvas, choose **Provider · native handoff** under **Execution mode**, then configure **Sub-Agent count**:

| Setting | Meaning |
| --- | --- |
| Auto | Uses one Agent without list fan-out; with fan-out, derives the count from the input list and batch size |
| Fixed count (1–32) | Partitions the input list among the specified number of Agents; there must be at least one item per Agent |
| `batch_size` | Items per batch (1–32); batching uses `distribution: "partition"` |
| `max_concurrency` | Maximum active batches (1–32), rather than the total batch count |
| `scheduling: "parallel"` | Runs batches in parallel, with `max_concurrency` limiting the active window |
| `scheduling: "serial"` | Releases the next batch only after the previous result is journaled |

For Auto, click **Enable list fan-out**, then edit the distribution and scheduling fields in **Runtime fanout contract**. For example, 31 input items with Auto, `distribution: "partition"`, `batch_size: 10`, `scheduling: "parallel"`, and `max_concurrency: 2` produce four batches of at most ten items, with at most two active at once. Input bindings and result output names must match the node's actual definition. Save, validate, and publish before starting a task with the updated settings.

Main nodes do not expose this count control. A Thread continuation reuses one existing chat rather than creating more Agents. A Role calls one helper; configure list distribution on a Workflow node.

Codex also limits concurrently open subagents within a session. In the existing `[agents]` section of your user config, `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`), or project config, `.codex/config.toml`, set for example:

```toml
[agents]
max_concurrent_threads_per_session = 8
```

This limit excludes Main and does not force every task to spawn eight Agents. Existing configurations can use the legacy alias `max_threads`; do not set both. Workflow `max_concurrency` does not raise Codex's own limit, so keep native-node concurrency within the session's available capacity. See the [official Codex subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).

### Save and run

The four actions have different meanings:

1. **Validate** checks the current definition and contracts.
2. **Save draft** stores edits without creating a launchable published revision.
3. **Publish workflow** pins a revision and checks launch blockers.
4. **New task** starts one Run from an already published revision.

“Structurally valid” does not mean the current machine satisfies every runtime dependency. Node Provider, tool, environment, and user-input checks continue at the launch boundary.

Run settings can point to an existing project directory, or the Host can create a workspace when the field is empty. A reusable Workflow should not hard-code the author's project path.

You can also invoke a published Workflow directly from Codex:

```text
Use $codex-agents-workflow:workflow-control-plane.
Run my installed video-use Workflow.
The source folder for this Run is D:/demo/recordings.
Stop at the plan and preview approval gates.
```

If no matching published Workflow exists, Codex must say so rather than inventing one or silently selecting another definition.

## 8. What happens during a Run

### Nodes receive scoped context

Main nodes and native subagent nodes both use node-scoped input projection. They do not automatically inherit the parent chat, ambient Skill directories, or raw transcripts from other nodes. They retain the basic reading, writing, image, coding, and tool capabilities required by the task.

### The Host owns mechanics and handoffs

The Host prepares task packets, paths, IDs, hashes, bindings, and result schemas. Nodes write code and artifacts directly to the workspace and return a short status plus file locations.

### Main does not poll while waiting

After a subagent starts, the Host owns an event wait for up to one hour. Completion, failure, attention, a child result, or a handoff advances the execution chain immediately. A timeout renews the same wait instead of making Main reread state every few seconds.

### Retry only the failed unit

Parallel shards retain independent attempts and artifacts. A failed shard does not invalidate successful siblings; repair receives only the failed items and their evidence.

## 9. Native agents and Threads

Ordinary independent work defaults to native agents. They are suited to reading one task packet, writing directly to the local workspace, and returning artifact locations.

A Thread is for a process that genuinely needs to continue the same visible Codex task across stages. Continuation nodes must reference the recorded task identity rather than create a lookalike conversation. Threads are not the default executor and do not provide additional OS-level isolation.

The optional Math Workflow demonstrates the choice: short investigations use one-shot agents, while a persistent Thread is retained only when continued research needs it.

## 10. Recovery and troubleshooting

| Symptom | Check |
| --- | --- |
| Plugin tools or the workbench entry are missing | Verify that the plugin is enabled; restart the Codex desktop app after installation or update, then call a plugin tool to verify the connection |
| A Role says its Provider is disabled | Enable that connection or bind the Role to an available Provider |
| A Workflow installs but cannot launch | Check node Providers, tools, dependencies, and Run inputs |
| Authoring stops | Inspect the explicit error and Run record; check login, model, dependencies, and Host logs |
| A child agent does not advance | Check whether the Run is waiting, failed, or needs attention; do not start another polling loop |
| The page disconnected while work continues | Recover the original Run and reconcile real tasks and artifacts |
| The old UI appears after update | Embedded view: restart Codex and reopen it. Browser console: stop the old service and launch the installed version |

To recover:

```text
Recover control of Run <run-id>. Reconcile its existing nodes, agents, and local artifacts, then continue from the unfinished point.
```

Recovery does not rerun successful nodes or approve human gates automatically.

## 11. Update

Update the local clone:

```sh
git pull --ff-only origin main
```

On Windows:

```powershell
node plugins/codex-agents-workflow/scripts/install-local.mjs
```

The installer installs the current version and removes obsolete plugin-cache versions after releasing the processes that use them. It does not retain old releases indefinitely for rollback. Restart the Codex desktop app, reopen the embedded workbench, and call a plugin tool to verify the connection; opening the page does not require a new task. Restart CLI sessions to load updates.

Workflow definitions, Role customizations, Provider settings, and Run records live in the user-level Codex configuration directory rather than the distributable repository.
