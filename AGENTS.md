# Maintainer context

The plugin identity is now `codex-agents-workflow`. The primary model is host-owned:
do not add model eligibility gates, reasoning floors or startup model advice for it.
Resolve and pin Strict model metadata only after official authentication and before
thread creation; anonymous built-in catalogs cannot establish account availability.
Skill expansion prompts must carry the exact compiler field contract and finite
condition syntax. Keep inferred graphs acyclic; names/output schemas are data,
while Provider, role, permissions and acceptance remain compiler-owned.
New Skill expansion planning pins editable skill2workflow routing rules. AI analyzes parallel dependencies, main/subagent responsibilities and human gates.
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
docs/PLUGIN_RENAME.md. Historical qualification records retain their original paths.
Strict session UI derives terminal state from the current attempt's journal, fences
cached snapshots by attempt ID, and preserves active-session error diagnostics.
Skill credential scanning must distinguish literal values from code expressions,
type annotations and shell templates. Preserve executable source bytes when no
credential literal is present; true redactions remain visible Draft blockers.

The v0.8.0 candidate is `plugins/codex-agents-workflow`; its control-plane package/server is
0.5.0. Configuration v7 is activated through explicit transactional migration.
`default-config.json` remains the v6 migration seed and compatibility fixture;
installation and tests must not migrate real user configuration automatically.
The current language is in CONTEXT.md and docs/V7_UPGRADE.md. Release evidence is
docs/V7_RELEASE_EVIDENCE.md; do not describe pending CI or release steps as complete.

The user's v7 plan and five amendments were accepted on2026-09-04. ADR0002–0007
and docs/V7_VISUAL_WORKFLOW_EXECUTION_PLAN.md are authoritative architecture.
The submitted proposal is preserved under docs/proposals as design material.
Use separate branches for large changes. Fix root causes, surface failures and
keep meaningful journal/audit diagnostics. Never suppress audit durability errors.

Workflow Packs have immutable whole-content revisions, CAS writes, bounded resource
manifests and delete-to-trash. Runs pin the complete dependency closure and use a
fsynced hash-chain journal, writer lock and explicit recovery. Definitions edited
or deleted after Run start never replace its intact pinned material. See
V7_CORE_CONTRACT, V7_RUN_CONTRACT and V7_SERVICE_CONTRACT.

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
Actual local and three synthetic official-login qualification cases are recorded
under docs/baselines/v7-strict-2026-09-04. A fixture pass is not new qualification.

Skill import discovery defaults to bounded scans of CODEX_HOME/skills and plugins/cache,
with optional user-provided folders. This is not an executor enabled-Skill inventory.
Explicit host discovery still uses actual configured-profile metadata RPCs. Imports retain complete
bounded resources and visible dependencies; source paths are never edited. AI
expansion uses a selected native Provider and its own read-only planning Run. It
requires main acceptance and exact-source CAS before another unreviewed Draft.
SkillRef pins explicit source/name/hash/nested snapshots; SubWorkflow inherits exact
permissions and child revisions. Source status observes SKILL.md hashes only.
Read V7_SKILL_IMPORT_CONTRACT before changing these rules.

Parallel writers need qualified Strict brokers and owned detached Git worktrees.
Join requires exact patch review, acceptance and target CAS. Never clean an
unaccepted or changed worktree. Git helper uncertainty persists and blocks all
further integration/cleanup until reconciled. See V7_PARALLEL_CONTRACT and
V7_RECOVERY_CONTRACT for controller/lease rotation, exact reattachment and cancellation.
Cursor runtime scope violations persist evidence before Stop and share manual
cancel's exact-identity confirmation. A Stop click alone is not terminal evidence;
identity loss keeps the task unconfirmed and blocks acceptance.

The React/TypeScript/React Flow editor is in web-src; committed web/workflows.*
assets are built with pinned esbuild and include all bundled licenses. No runtime
npm is required. Canvas/transient layout is never a second IR authority. Draft
errors remain visible and repairable. Browser tokens remain in memory; reconnecting
requires explicit human tree adoption. Live output is a bounded unverified suffix;
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
never use real credentials without existing authorization. Consult V7_WORK_LOG for
observed failures/fixes and distinguish actual platform evidence from emulation.

Review regression evidence must use actual independent OS processes for connector
store contention, and real manager-created worktrees for relocation checks.
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

The human editor exposes Save changes and Start rather than a separate Ready
publication action. Start saves edits, publishes with the returned revision CAS,
then launches with the published revision pin. Any failure stops this sequence.
Enabled controls launch availability; Draft/Ready remain internal lifecycle states.
Existing Runs retain their original pinned version when the editor is saved.

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
