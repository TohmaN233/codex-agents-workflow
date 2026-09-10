# Using Codex Agents Workflow

[English README](../README.en.md) · [中文](../README.md) · [Detailed Chinese guide](TUTORIAL.zh-CN.md)

Codex Agents Workflow is the successor to **sol-subagent-control**. It adds a visual workbench, versioned workflows, Skill conversion, per-node model bindings, and coordination of separate Codex tasks.

## Why use it?

Astra can be valuable for difficult judgments, but using an expensive model for every preparation and execution step can be wasteful. Assign routine work to a suitable lighter model and reserve stronger models for the steps that need them.

Workers have their own contexts. The main agent coordinates the task and collects useful results and evidence instead of carrying every intermediate operation in its conversation. This can reduce expensive-model work and pressure on the main context. It is not a guarantee of fewer total tokens: excessive delegation and repeated handoffs also cost tokens.

## Install and open

You need Codex with the required plugin/task capabilities, Node.js 20+, and Git.

~~~sh
git clone https://github.com/TohmaN233/codex-agents-workflow.git
cd codex-agents-workflow
codex plugin marketplace add .
codex plugin add codex-agents-workflow@codex-agents-workflow
node plugins/codex-agents-workflow/scripts/install-agents.mjs
~~~

Start a fresh Codex task after installation. Ask:

~~~text
Use $codex-agents-workflow:workflow-control-plane and open the workbench.
~~~

On Windows, run this from the cloned repository or double-click the file:

~~~powershell
.\plugins\codex-agents-workflow\scripts\open-control-console.cmd
~~~

On macOS / Linux, run this from the repository root:

~~~sh
sh plugins/codex-agents-workflow/scripts/open-control-console.sh
~~~

The Windows launcher opens the installed plugin; the `.sh` script starts the workbench from the current clone. Keep the terminal process running.

![Per-node model selection](assets/tutorial/workbench-node-model.png)

Both pages offer 中文 / English. Your language preference persists in the browser; changing it preserves unsaved edits and does not translate your stored prompts, workflow names, or model IDs.

## Configure models before generating

The workbench needs valid model configuration before its **Generate workflow automatically** button can run. Your current Codex model is not automatically the workbench's generator.

1. Open **Provider settings**, enable the native configurations you want, and save their model IDs, reasoning levels, suitability descriptions, and capabilities.
2. Import a Skill and open **Import review → Advanced options: execution settings, routing rules, and import diagnostics**.
3. Select **Default generation executor (registered model configuration)** and **Review executor (registered model configuration)**.
4. Check the skill2workflow routing rules. These choose execution bindings by responsibility; the generator does not become the executor of every node.
5. Click **Generate workflow automatically**. Inspect progress, review evidence, and any required repair or sign-in actions.

Automatic conversion currently uses registered native configurations for generation and independent review. Cursor and Grok can be separately configured execution endpoints, but are not the generator/reviewer adapters for this button. Cursor CDP inherits its client-side model choice, not the main Codex task's model.

Enabling a Provider or saving settings alone does not call a model.

## Convert a Skill into a workflow

In the library, choose **Import from Skill**, scan the default Codex folders or your own folder, inspect the exact version, and import it. The source files remain unchanged; the imported instructions and resources form a pinned snapshot.

Generate the workflow, then inspect:

- step order and truly independent parallel work;
- the original Skill's hard rules and human approval points;
- main-agent, worker, and separate-task responsibilities;
- model bindings, inputs, outputs, and required tools.

Accept the shown graph as an editable draft, adjust nodes, save, and publish. **Publishing does not execute the business task.** Launching creates a separate Run for a concrete request.

![Skill conversion in progress](assets/tutorial/skill2workflow-generation.png)

Open the generated graph to adjust dependencies, approval points and node models.

![Converted video workflow](assets/tutorial/workbench-video.png)

You can also ask Codex to import and convert a specified Skill, inspect the draft, and stop before running it.

## Run a workflow directly in Codex

The workbench is not mandatory for each invocation. For a published definition:

~~~text
Use $codex-agents-workflow:workflow-control-plane.
Run Bounded code change for this specific issue in the current project: …
Use the configured node bindings and verify the result.
~~~

For a separately imported video workflow:

~~~text
Use $codex-agents-workflow:workflow-control-plane.
Run my published video-use workflow.
Read D:/demo/recordings/剪辑需求.txt and prepare an introduction video.
Pause at the workflow's plan and preview approval points.
~~~

**video-use is not bundled.** You must supply and import that Skill yourself. The [real example and three screenshots](../README.md#示例二在-codex-中直接执行-video-use) show delegation, user approval, and the returned video previews. The example uses the original [browser-use/video-use Skill](https://github.com/browser-use/video-use).

## Separate tasks and the mathematics example

A thread node starts a visible Codex task. A later continuation sends new input to that same recorded task after its dependencies complete. The controller checks the exact task and corresponding completion rather than substituting a new conversation.

This fits planning/preparation workflows and long-lived research. One-off workers are often enough for independent investigations. The bundled **Mathematical Research Hybrid** example starts with parallel literature, toolbox, analogy, counterexample, and route probes. Only after human confirmation does it retain a persistent research task; the main agent still accepts the final result.

If that definition is not in your saved library, ask Codex to create a draft from the repository's [example definition](../plugins/codex-agents-workflow/control-plane/lib/workflow-presets.mjs), then review your own bindings and publish it. Updates do not overwrite customized definitions or automatically reinstall deleted examples. The thread startup smoke workflow is a developer test fixture, not a production preset.

Thread execution is Cooperative, not OS-level isolation. Main-agent acceptance and observed execution evidence remain necessary.

## Updating and troubleshooting

For the local-clone installation, keep the clone clean and run git pull --ff-only origin main. On Windows, then run:

~~~powershell
node plugins/codex-agents-workflow/scripts/install-local.mjs
node plugins/codex-agents-workflow/scripts/install-agents.mjs
~~~

The retaining installer preserves old entrypoints needed by active hosts. It is Windows-specific. On other platforms, stop hosts using the old plugin before reinstalling through the Codex CLI. Start a new task after updating.

Generation failures should show a reason: check configured models, native Provider eligibility, authentication, and runtime requirements. Structural validity alone is not launch readiness. A failed connector must not silently switch Providers.

Configuration defaults to ~/.codex/codex-agents-workflow/control-plane.json, or the corresponding CODEX_HOME directory. User workflows and runs are separate from the distributable repository.

See [connector setup](../plugins/codex-agents-workflow/skills/control-plane/references/provider-contracts.md) for execution backends.

![Parallel mathematical research](assets/tutorial/workbench-math.png)

## Resume after losing controller state

Give Codex the original Run ID and explicitly authorize recovery. The main conversation can call `workflow_recover_control` without the lost token; existing authorization need not be requested again. The workbench also offers **Take control and pause Run**. Both paths invalidate old control and leases and pause the pinned Run tree. They preserve approvals and outputs, and do not automatically retry, approve or complete work. The main controller must reconcile the original tasks and verify artifacts before acceptance.
