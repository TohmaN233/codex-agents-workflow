## Strict, imports and editing

New task Workflows default to Cooperative with task-scoped bounded writes. Strict is an explicit isolation choice, not the default permission level.

Strict requires a qualified executor catalog, explicit Skill input and bounded tool
broker. It is not an OS filesystem ACL. Read `workflow_capabilities` for the currently qualified executor. Never
change a failed Strict request to Cooperative. Cooperative explicitly retains its
host's ambient behavior. Missing external tools, executables or scripts remain
requirements; do not execute imported scripts to infer their behavior.

Use `workflow_skill_inventory` for default Codex-folder import discovery; pass
`discovery: folders` and an optional absolute `folder` for a custom source. This
is not a list of executor-enabled Skills. Explicit `discovery: host` with a
workspace retains qualified host discovery. Preserve the discovery selection
when importing. Skill authoring uses editable skill2workflow classification rules
pinned to the authoring Run; configured eligible Providers are assigned per node
by the compiler, never inherited from the planner. Read `workflow_routing_defaults`
for current rules; shared defaults are edited in the console. Import only the selected
entry through `workflow_import_skill`; the result is a full-resource Draft with
visible provenance and unresolved dependencies. Never modify the original Skill.
`workflow_source_status` reports changed SKILL.md hashes without changing any pins.
SkillRef requires exact path/name/hash and explicit nested pins. Inline creates a
new reviewable Draft; a new source version never silently updates an old Run.

There are two built-in authoring Workflow configurations. Read them with
`workflow_authoring_workflows`: `system.skill2workflow` snapshots a selected Skill,
while `system.build-workflow` snapshots an ordinary brief created with
`workflow_build_workflow`. After that input adapter they use the same semantic
planner, deterministic WorkflowForge compiler, review contract and human publication
boundary. Do not pretend a from-scratch code-check or other brief is a Skill import.

The planner output is the closed, compact `workflow-semantic-blueprint/v4` contract.
It fills only semantic activities, approvals, named sequence/parallel/choice groups,
data relationships, source dispositions and requirement assignments. It does not
choose a root. The Host owns all
nodes, edges, IDs, schemas, pointers, bindings, executor/provider fields, permissions,
retry fields, evidence spans and packaging. Requirement assignments may name only
exact observed requirement IDs supplied by the Host. WorkflowForge
normalizes the semantic reference graph as a DAG: repeated choice bodies converge,
nested mutually exclusive exits remain exclusive, approval mappings retain only the
unique source-grounded gate and post-gate operations, and task continuation is derived
only for a direct same-Provider isolated-worker successor. Brief-built task Workflows
default to Cooperative; importing a Skill retains the imported source policy. Named
data types describe nested object/list interfaces while the Host generates JSON Schema
and rejects duplicate, cyclic or contradictory definitions. An activity that explicitly
cites a pinned executable resource must type each structured output through a named
type, and the Host binds that cited resource to the activity. Persisted v2/v3
blueprints are upgraded mechanically without consuming a planner repair. There are
at most two planner attempts: one initial plan plus one
`workflow-semantic-repair/v1` stable-key delta for a genuine semantic omission,
contradiction, distortion or misassignment. The second attempt never regenerates the
whole plan. Mechanical output/schema errors and reviewer protocol errors stop visibly
and never spend the semantic repair.

User-requested graph/resource edits use `workflow_read`, `workflow_save` and
`workflow_write_resource` under exact revision CAS. The console owns human review
and Ready publication. Authoring uses a separately selected native Provider in
`workflow_create_authoring_run`; normal Run collection and main acceptance precede
`workflow_apply_authoring_result`. Historical expansion operation names remain only
for persisted-client compatibility. The inferred graph still requires human review.
The host owns deterministic source anchors, typed requirement fields, graph-envelope
formatting and validation. A planner maps those stable IDs and supplies only semantic
decisions; echoed host fields are discarded and replaced by the canonical projection.
The shared planning/review packet includes the imported Draft's host-owned baseline
requirements and static import observations. Every selected supporting resource must
be reconciled against those facts before submission; neither planner nor reviewer
should rediscover or ask the proposal to echo them.
Automatic semantic correction is evidence-driven and bounded to one repair. Identical
or non-improving semantic feedback stops for inspection. Final review uses the pinned
review packet and references without rereading a duplicate source entrypoint. When host projection or compiler rules change after a
planner proposal has completed, recheck that exact persisted artifact by verifying its
source Run, attempt, artifact hash and source revision; rerun deterministic compilation
and independent review without spending another planner call.
After changing conversion, projection, validation or review code, validate in this
order before any real Provider call: focused contract tests, affected cross-module
tests, offline validation of stored Workflow definitions, then deterministic preflight
of the exact persisted proposal. A Provider Run is acceptance evidence, never a way to
discover holes that these host checks could have found first.
Static relocation proves pinned resource access only, not functional portability.

Use `workflow_export_workflow_package` to create an installable, content-addressed
package for one immutable revision. Install local package JSON or an HTTPS package
through the authenticated console. The installer verifies format/API compatibility,
Workflow schema, package digest, resource hashes, revision identity and the exact
Provider/tool/MCP/executable dependency manifest before atomic creation. Remote bytes
may be pinned with SHA-256. Installation never downloads dependencies, publishes an
unreviewed Draft, or silently substitutes local Providers.


