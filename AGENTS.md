# Maintainer context

Editable native Workflow Providers use the generic `default` host agent with explicit
model/effort and fresh context. Fixed orchestration roles remain separate; their
model/effort contract comes from the shipped agent TOML, and Cooperative Workflow
validation rejects conflicting bindings before creating a Run. Provider IDs resolve
from the current registry for each new Run; deletion invalidates dependent Workflows.
Existing Run snapshots remain immutable. Skill entrypoints describe task triggers;
historical migration protocols do not belong in normal execution instructions.
Bundled collaboration presets parallelize separate prompt/planning and execution-
preparation Codex tasks under one host main controller. Planning uses the planning
route; ordinary production uses the implementation route; image production uses the
complex-implementation route. The Join releases the bounded-write continuation only
after both branches succeed. Adding a preset binds registered routes and never
overwrites an existing user definition.
Updates and tool discovery do not reinstall deleted presets.
The library homepage lists saved Workflows directly. Do not add a separate built-in
preset gallery or promote smoke-test fixtures above that list. Preset constructors
remain available to existing backend callers and tests; saved user Workflows remain
independent library entries.
The production Mathematical Research Hybrid example uses parallel one-off Provider
workers for independent surveys and route probes, then starts one persistent task
only after a human confirms the shared-state route. Thread startup smoke coverage
belongs only in test fixtures, not the production preset catalog. Do not distribute
the user's imported video-use Skill or Workflow Pack; tutorial screenshots may
illustrate that separately supplied workflow without bundling its executable content.
README and the Chinese/English tutorials describe the workbench as the successor
to sol-subagent-control. Keep model setup, manual launch, Skill conversion and task
continuation examples synchronized with actual controls. Do not claim a preview is
final delivery or promise a fixed reduction in token use.

Thread-controlled collaboration is distinct from an internal subagent handoff. A
`thread` executor creates or continues a user-visible Codex task through the main
controller, pins its exact thread ID in the Run receipt, waits/reads that exact task,
and only then completes the node. A continuation must reuse its declared upstream
thread ID; replacement threads fail validation. The built-in image preset starts the
prompt and image-preparation tasks in parallel, then continues the image-preparation
task after the prompt branch succeeds. Automatic Skill2Workflow routing may choose a
main controller or Codex task thread; legacy Provider handoffs remain readable for
existing definitions. Thread execution is Cooperative: write scope limits outputs
only, while task threads retain host tool and input-read access.

The plugin identity is now `codex-agents-workflow`. The primary model is host-owned:
do not add model eligibility gates, reasoning floors or startup model advice for it.
Resolve and pin Strict model metadata only after official authentication and before
thread creation; anonymous built-in catalogs cannot establish account availability.
Skill expansion prompts must carry the exact compiler field contract and finite
condition syntax. Keep inferred graphs acyclic; names/output schemas are data,
while Provider, role, permissions and acceptance remain compiler-owned.
New Skill expansion planning pins editable skill2workflow routing rules. AI analyzes parallel dependencies, main/Codex-task responsibilities and human gates.
Automatic mode proposes eligible registered Providers using pinned suitability descriptions;
fixed mode retains user-owned task-type mappings. The compiler validates every choice
and never expands access. Main model identity remains host-owned.
Never inherit the planning Provider for every execution node. Missing eligible routes
fail visibly before replacing the coarse Draft. Final Main acceptance stays fixed.
Expansion packets include the future Run input convention, actual coarse input
schema/resource binding and Strict execution limitations. Standalone tool nodes
are rejected for Strict expansion; bounded resource reads belong inside agents.
Planning and review nodes can read the complete immutable imported resource snapshot;
manifests alone cannot establish reference semantics. These reads never execute scripts.
Human gates are approval boundaries with the exact output {approved:true}, not
custom-response forms. Reject incompatible schemas and references to invented
gate fields. Creative briefs/feedback are explicit Run inputs or later Runs.
Grok initialization must retain process-exit evidence through asynchronous state
publication and prevent prompt submission after an observed transport exit.
Remote completion stops the Grok deadline before local scope verification and
durable publication. Slow evidence persistence must not produce a false remote
timeout; acceptance still waits for the full scope check and persisted result.
Cursor stable reply observation likewise ends the remote deadline before local
scope verification and durable publication.
Default authentication reuses the existing official Codex login through a
credential-only App Server and ephemeral chatgptAuthTokens RPCs. Never copy
auth.json, refresh tokens, cookies or account config into node profiles; never
put access tokens in logs, Workflow inputs, resources or worker tools. Missing
host auth fails visibly without opening OAuth pages. Managed per-node login is
an explicit alternative only. Account identity must remain fixed during a node.
The bundled reviewer is `codex_workflow_reviewer` (GPT-6 Astra / medium).
Existing user Provider settings and Run pins are not rewritten by installation.
The public MCP service, configuration path, Provider IDs and native role templates use
`codex-agents-workflow` names. A one-time startup migration recognizes the old
`sol-advisor` directory and moves it as a whole when no owned path-sensitive Git
worktrees are present; otherwise it refuses with an actionable diagnostic instead of
stranding those worktrees. It does not copy or retain a second active store. See
the migration implementation. Historical qualification fixtures retain their original paths.
Strict session UI derives terminal state from the current attempt's journal, fences
cached snapshots by attempt ID, and preserves active-session error diagnostics.
Skill credential scanning must distinguish literal values from code expressions,
type annotations and shell templates. Preserve executable source bytes when no
credential literal is present; true redactions remain visible Draft blockers.

The v0.8.0 candidate is `plugins/codex-agents-workflow`; its control-plane package/server is
0.5.0. Configuration v7 is activated through explicit transactional migration.
`default-config.json` remains the v6 migration seed and compatibility fixture;
installation and tests must not migrate real user configuration automatically.
The current language is in CONTEXT.md and runtime contracts. Do not describe pending CI or release steps as complete.

The shipped control-plane Skill references and runtime modules define the maintained architecture.
Use separate branches for large changes. Fix root causes, surface failures and
keep meaningful journal/audit diagnostics. Never suppress audit durability errors.

Workflow Packs have immutable whole-content revisions, CAS writes, bounded resource
manifests and delete-to-trash. Runs pin the complete dependency closure and use a
fsynced hash-chain journal, writer lock and explicit recovery. Definitions edited
or deleted after Run start never replace its intact pinned material.

Run-pinned resources are logical identifiers such as `source/SKILL.md`, never
filesystem paths. Native execution handoffs expose those IDs and the audited resource
reader only. A Codex task-thread handoff instead carries a bounded immutable UTF-8
snapshot in its initial or continuation prompt. Binary or over-budget resources fail
before task creation; the controller never leaks the content-addressed object root or
derives a local/Markdown link by joining it with a logical resource ID.

Provider bindings, approval semantics and non-glob path boundaries are user policy.
No auto-enable, substitute Provider, implicit retry or Strict downgrade. Structural
Ready is separate from launch readiness. Main acceptance is required on every
successful path. Worker output is an assertion to verify, not authority.

Strict under lib/execution is default-off and accepts only the qualified Windows
x64 Codex0.145.0 SHA from strict-config.mjs. Catalog controls include independent
orchestrator.skills and orchestrator.mcp namespaces. Its boundary covers verified
catalogs, explicit injection and the controlled workspace/resource broker, not an
OS ACL. Unsupported tools, platforms and admin roots fail closed. Never use the
old current-thread adapter as imported Strict or copy shared auth into profiles.
Qualification is pinned in strict-config.mjs. A fixture pass is not new qualification.

Skill import discovery defaults to bounded scans of CODEX_HOME/skills and plugins/cache,
with optional user-provided folders. This is not an executor enabled-Skill inventory.
Explicit host discovery still uses actual configured-profile metadata RPCs. Imports retain complete
bounded resources and visible dependencies; source paths are never edited. AI
expansion uses a selected native Provider and its own read-only planning Run. It
requires main acceptance and exact-source CAS before another unreviewed Draft.
SkillRef pins explicit source/name/hash/nested snapshots; SubWorkflow inherits exact
permissions and child revisions. Source status observes SKILL.md hashes only.
Read the shipped control-plane references/editing.md before changing these rules.

Parallel writers need qualified Strict brokers and owned detached Git worktrees.
Join requires exact patch review, acceptance and target CAS. Never clean an
unaccepted or changed worktree. Git helper uncertainty persists and blocks all
further integration/cleanup until reconciled. See the shipped control-plane
references/parallel.md and references/recovery.md for controller/lease rotation,
exact reattachment and cancellation.
Cursor runtime scope violations persist evidence before Stop and share manual
cancel's exact-identity confirmation. A Stop click alone is not terminal evidence;
identity loss keeps the task unconfirmed and blocks acceptance.

The model-settings console and Workflow editor share web/i18n.js for Chinese and
English presentation. Persist only the locale under codex-agents-workflow.locale
in browser localStorage, with browser-language initialization and same-origin tab
updates. Translate explicit UI copy at render time; never translate stored names,
prompts, resource contents, API enum values or model IDs. Language changes must not
reload/remount the editor, save configuration, or discard unsaved form state.
Use complete t(Chinese, English) pairs, including accessible labels and dialogs.

The React/TypeScript/React Flow editor is in web-src; committed web/workflows.*
assets are built with pinned esbuild and include all bundled licenses. No runtime
npm is required. Canvas/transient layout is never a second IR authority. Draft
errors remain visible and repairable. Browser tokens remain in memory; lost control requires explicit user-authorized tree
recovery through the main host or authenticated console adoption. Conversational
recovery records host-attested user authorization and observed-sequence CAS; it
never grants approvals, completes nodes, changes pins or persists plaintext tokens. Live output is a bounded unverified suffix;
durable artifacts and main acceptance determine completion.
Rendered diagnostic details hide control_token and lease_token recursively.
Redaction must never mutate the in-memory controller, execution payload or editable IR.

Checks:

```text
node plugins/codex-agents-workflow/control-plane/test/run-tests.mjs
node --test plugins/codex-agents-workflow/scripts/test/native-role-tools.test.mjs
node --test spikes/skill-isolation/assertions.test.mjs spikes/skill-isolation/fixture-policy.test.mjs
cd plugins/codex-agents-workflow/control-plane
npm ci --ignore-scripts --no-audit --no-fund
npm run check:web
```

Also run both repository verify scripts and the Windows/Linux/macOS core/console
CI matrix. Real Codex probes are opt-in bounded tests outside the runtime package;
never use real credentials without existing authorization. Distinguish actual
platform evidence from emulation.

Review regression evidence must use actual independent OS processes for connector
store contention, and real manager-created worktrees for relocation checks.
The core suite serializes test files because each file can own multiple subprocesses;
contention tests still create concurrent OS processes explicitly. Packaged MCP tests
use an isolated registry fixture and never depend on a developer's Codex installation.
RunPanel refresh publishes state/next/events/live as one generation-fenced snapshot;
Run sequence cannot regress and disposed Run callbacks cannot restart refreshes.
The stdio drain process test uses an OS SIGTERM on POSIX. On Windows it injects
SIGTERM into the actual child listener over test-only IPC because child.kill on
Windows forcibly terminates Node without dispatching a JavaScript signal handler.
Do not describe that Windows test as an OS graceful-termination qualification.

Connector deadlines must recheck terminal observation after asynchronous reads and
inside the durable mutation lock. Poisoned Grok persistence must still close owned
resources and emit a redacted lifecycle diagnostic. Orphaned connector store locks
fail closed with CONNECTOR_STORE_ORPHANED_LOCK; never race automatic unlink-based
reclamation. Recovery requires stopping all control-plane processes, inspecting
persisted tasks, removing the reported orphan lock, and restarting/reconciling.

Grok intentional disconnect/reconcile cleanup invalidates old callbacks; local ACP
stream loss or request timeout does not certify remote terminal failure. Preserve
workspace reservation until exact reconciliation or explicit abandonment. Both
connector background lifecycles observe failures and close their owned resources
without depending on persistence recovery. Stdio shutdown awaits response write
callbacks (including rejection responses) before exiting, and write failures are
fatal rather than successful delivery. Exercise large responses under backpressure.

Cursor synchronous start/control/reconcile failures must release local CDP and scope
monitor ownership when persistence fails, while retaining remote uncertainty and
workspace reservation. Grok human decisions commit request identity and decision metadata
before resolving ACP requests; poisoned decision writes must never deliver approval.
Concurrent decision attempts are rejected while one decision is committing.

Run state is journal-only; do not reintroduce a write-only run.json cache. Console
run_snapshot shares one verified record across public state, next actions and
authorized events. Every poll still verifies pins/resources/journal integrity.

Accepted form content remains transport-only; decision metadata must not persist it.

Decision guards require the matching needs_permission/needs_input state and live
process/scope ownership; stale approval cannot revive attention/cancelling tasks.

Console event deltas advance from the last published refresh only; changing
controller authority restarts the cursor. Rejected stale refreshes cannot advance it.

The human console offers one-click Skill generation: managed read-only planning
workspace and planner defaults, bounded journal-backed claim/dispatch advancement,
and visible progress. Never auto-accept the final review. Explicitly configured automatic Skill generation may repair closed read-only planning rounds with journaled feedback and a pinned limit; ordinary Workflow retries remain explicit. Never silently retry other failed
work. Explicit human acceptance applies the exact source-revision Draft; detailed
Provider, workspace, and recovery controls remain in advanced options.

Skill2Workflow generation defaults resolve registered Providers at start. The reviewer
defaults to a dedicated Sol/high Provider, separate from Strict global main defaults. Its
registered configuration is pinned in server-created Run policy (never imported provenance) and permission revocation remains effective.
Automatic repairs preserve old attempts, require closed read-only sessions, reject
cancelled/paused Runs and stop on model/auth/transport errors or the round limit.

On a human's first automatic-generation request, register the bundled native
Sol/high generation reviewer only if its ID is absent, using configuration CAS.
Never replace an existing/disabled Provider or an explicit different reviewer ID.
Installation alone does not enable Providers or mutate user configuration.

Local model discovery uses the newest discovered local Codex executable (numeric
version ordering), or CODEX_CATALOG_BINARY when explicitly set. Discovery permits
only initialize/account-read/model-list RPCs, never model turns or login. Client
model inventory is separate from the qualified Strict runtime. Grok/Cursor discover
local clients, honor explicit path overrides and report unknown model catalogs
as client-managed rather than inventing lists.

Skill conversion generation and review share conversion-contract.mjs through the
pinned analysis/request.txt packet. Preserve intended source phases even when
execution capabilities are missing; never substitute a blocker-only workflow or
claim execution. Refer to pinned detailed instructions rather than copying them
into every node. Review conversion semantics, not imported implementation quality.
The resource broker offers audited 1–200-line/32-KiB pinned reads for large
references; partial reads report coverage and never establish full-file review.
Generation progress exposes journal-derived round, model, elapsed stage time and
recent resource activity. Automatic repair never hides cancellation or acceptance.
Generation planner defaults may be independent of planning-node routing via
generation.planner_provider_id; absent means the prior planning route default.
Any enabled native read-capable Provider can perform generation review regardless
of its original role/model name. The finalizer remains read-only and human-accepted.

Strict model output reserves the exact top-level {"$workflow_blocked":"reason"}
response for missing prerequisites, capabilities or required answers. Validate the
bounded reason before schema checking, close the session, fail the node durably
with WORKFLOW_NODE_BLOCKED and never publish a success proposal. This applies to
structured and unstructured results; it is not an automatic repair trigger.
Conversion prompts require actual successful producers before downstream gates,
and move interactive briefing/continuation answers into later explicit Run tasks.

Generation acceptance in the human console confirms the exact displayed inferred nodes
and edges atomically with saving the Draft, retaining source/proposal evidence. Raw
expansion API calls remain unreviewed. Structural errors, pending confirmations and
execution prerequisites are separate UI groups; none of the launch checks is suppressed.

Portable scripts, binary assets and external URLs are informational import observations,
not malformed definitions. Environment availability checks occur only at Run start.
Missing, redacted, unsafe and source-linked resources remain conversion blockers.
.env.example/.env.template are data templates scanned for literal credentials; real
credential files remain excluded. System /usr,/opt,/etc paths are runtime references.

New automatic generation Runs pin review_contract_version=2. Generation and review
share fourteen stable rule IDs. Review reports checks/evidence only; code computes
the verdict and validates source ranges and graph-ID coverage. Checklist-only
failures retry only the closed reviewer session within the pinned budget, preserving
the accepted generator output. Semantic findings repair the graph. Both human
acceptance and result application revalidate the checklist. Historical unversioned
Runs retain their original approval contract; never reinterpret existing pins.

The human editor separates publication from task launch. Publishing saves and
validates using revision CAS; launch requires an already published clean revision.
Enabled controls launch availability. Existing Runs retain their original pinned
version when the editor is saved.

Skill regeneration accepts both coarse and ai_expanded imports. Reconstruct the
source binding from immutable imported resources for an expanded graph, require
explicit routing rules, and pin the current source revision. Never treat old graph
nodes as source authority or replace the current graph before accepted CAS save.

Human-only cache cleanup marks current Workflow revisions and all Run pins, follows
their historical provenance/reference hashes transitively, then deletes unreferenced
revisions before resource objects under store/Run creation locks. Run artifacts and
trash remain intact. Plugin cleanup is limited to this plugin's cache, preserving
installed, configured and process-referenced versions; recheck before deletion.
Every mutation has a durable candidate list and completion/failure audit record.

The Windows manual launcher resolves the installed plugin from the Codex registry and uses fixed port 58712. Before restarting, verify any port owner is this plugin's cached Node open-console entry and recheck PID creation identity. Never terminate unrelated port owners or choose a random fallback port. The stable user launcher lives outside versioned cache directories.

Human task launch defaults to bounded_write over the task project without manual
allowlists or JSON inputs. The engine keeps the actual project as workspace and uses the explicit dot
boundary for the whole project. Parallel agents receive their isolated worktree
directory, never the original project path. Dot cannot escape the workspace. Advanced
API callers retain their explicit permissions. Generated agent operation_mode is
read/write according to actual work; production defaults to write, independent
review remains read-only, and compiler verifies Provider write capability and binds
write scope to the Run. Coarse instructions can write; planning/review jobs cannot.

For schemas that cannot accept a task description directly, prepareTaskInputs uses
the newest discovered local Codex with the configured main model, existing auth,
ignored user configuration and disabled shell/delegation in an ephemeral read-only
request. Validate the prepared JSON against the original schema before starting.
Missing facts become natural-language questions; never invent required inputs.
Valid inputs take the deterministic fast path without another model call.

Publication and task execution are separate console actions. Publishing saves/validates with CAS but never starts a Run; task launch requires an already published clean revision. Executable/environment declarations are agent-managed task dependencies, carried in the execution envelope, not host-inventory launch gates. Provider/tool/MCP authority checks remain mandatory.

Run entry accepts workspace-relative write targets and absolute descendants, normalizing once before immutable permissions are persisted. Internal node scopes remain relative; never bake task directories into reusable Workflow definitions.

MCP packaging must pass real initialize and tools/list subprocess probes from both ordinary and Windows namespaced plugin directories. Node script entry resolution can fail on namespaced cwd before application code runs; the packaged node -e bootstrap normalizes cwd before importing the server. Startup diagnostics are read-only and never create Runs.

New imported and manually authored task Workflows default to Cooperative; Strict remains opt-in. Runtime environment discovery is mandatory before Run creation, searches host installations and optional explicit directories, never installs, and blocks missing dependencies until consented host installation and recheck. A terminal Strict attempt must never report result pending.

In Cooperative execution, workspace/effective_allowed_paths constrain task output writes only. Tool discovery, invocation and input reads use host permissions and may occur outside the task directory. Never reinterpret bounded_write as a tool or read allowlist. Generator executable proposals need source evidence; optional dependencies stay conditional.

MCP startup resolves the installed registry version on every handshake through scripts/mcp-bootstrap.cjs; .mcp.json embeds the generated entry and uses a stable cache-parent cwd. Run build-mcp-entry.mjs after editing the bootstrap. Never launch a revision cached by the host or choose the largest cache directory. Local upgrades use scripts/install-local.mjs to retain active host entrypoints and rewrite legacy server entries as explicit latest-version bridges. Cache cleanup respects PID/start-time leases. Validate upgrades using scripts/check-upgrade-lifecycle.mjs (real Codex host, no model invocation), not only a standalone MCP probe.

New Runs pin thread_protocol_version=2: actual task prompts carry resolved workspace, access, output-write scope and dispatch identity; completion requires the host-observed matching turn ID and dispatch request ID. Unversioned Runs keep their collection contract. Shared task lineages cannot occupy parallel branches, and atomic dispatch guards fence unresolved turns, including historical graphs. Task retries require not_started/terminated evidence; explicit_retry never releases their shared lane. A start receipt must identify a fresh task. These are host-attested Cooperative contracts, not remote isolation or automatic host cancellation.

Connector receipt comparisons exclude only the mutable recovered_attachment annotation. Preserve immutable stored receipts and compare every remote session/run/agent/transport identity field exactly. Reattachment metadata never proves remote termination; timeout and cancellation remain unconfirmed until the connector observes terminal evidence.

Public documentation is a screenshot-led usage tutorial. Keep maintenance diaries,
repair histories and submitted development plans outside the repository. Do not
enforce README length, frozen prose or historical version narratives in verification
scripts. Link third-party Skills to their original repositories; do not bundle them.
Keep docs limited to the current Chinese/English usage tutorials and their referenced
screenshots. Remove obsolete PNGs, architecture diaries, ADRs, historical baselines
and duplicate contract documents; runtime guidance belongs in the shipped Skills.
