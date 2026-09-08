# Skill import and expansion foundation

The service exposes inventory/import, resource relocation, review packets,
expansion packets and managed expansion Runs as Workflow MCP tools. The default
inventory scans CODEX_HOME/skills and CODEX_HOME/plugins/cache (default home/.codex).
An optional absolute folder selects another import root. Bounded traversal skips
links and reports per-path errors. This reads SKILL.md metadata only; it requires
no Strict binary, login or model invocation. Cache entries show their full source
paths, including versions; discovery does not claim those Skills are enabled.
Explicit host mode retains the qualified configured-profile skills/list adapter
and its before/after configuration integrity check. Import repeats the same
selected discovery mode/folder and verifies source identity before snapshotting.

Inventory selection is an exact canonical path plus source hash. Import refreshes
that selection, reads bounded UTF-8 instructions and snapshots portable resources.
The parser supports real YAML1.2, quoted/folded values and bounded aliases; invalid
or duplicate metadata fails visibly. The bundled yaml2.9.0 parser is ISC licensed
and has no runtime npm requirement. Its reproducible build uses pinned development
dependencies and `scripts/vendor-yaml.mjs`.

Coarse import invokes no model or script. It produces a Strict Draft containing
Start, one instruction Provider, main final acceptance and End. The complete
Skill text is a pinned resource, so arbitrary source text is not interpreted as
the control plane's template syntax. Provider identity/role remain user-selected.
`agents/openai.yaml` and `SKILL.json` are retained with hashes in provenance.
Declared MCP tools, executables, environment names and allowed tools become
requirements. Commands/transports/endpoints require explicit review, and no
connection or Provider is automatically registered. Unsupported/malformed optional
metadata remains a visible Draft blocker. The supported openai.yaml dependency
shape was checked against Codex0.145.0 core-skills/loader.rs. Generic SKILL.json
extensions outside the finite supported shape require review rather than silently
implying portability.

Unsafe/link/special/oversized resources, source-linked paths, scripts, binary
assets and unresolved references are explicit observations. Known credential
files are excluded; recognized credential values are replaced with clearly
identified requirement markers. These changes block launch and do not alter the
source. Screening cannot prove arbitrary files contain no secrets. Do not present
a redacted or partial snapshot as a runnable faithful replacement.

The resource-relocation check reads immutable Pack bytes after the original
source is unavailable. Its scope is `pinned_resource_access`, with
`functional_execution_proven: false`. It does not claim static analysis can
understand every script or that every imported Workflow will execute successfully.
`self_contained_candidate`, `external_requirements` and `source_linked` remain
distinct classifications.

Expansion preparation binds a user-selected enabled Provider and read-only
access. `prepare_expansion` still returns `invoked: false` and an explicit handoff
packet. `create_expansion_run` now creates a separate immutable, read-only planning
Pack under workflow-expansion-jobs and a normal journal Run. Native Provider
execution uses the qualified Strict manager, normal claims/approval gates, exact
dispatch receipts and durable output. Unqualified Provider types fail explicitly.
The main controller must accept the planning result before apply_expansion_result
changes the source Draft under its original revision CAS. The planning Provider
does not determine every output node's execution Provider. Editable skill2workflow
rules classify routine implementation, complex implementation, review and planning,
then map these classifications to configured enabled Provider IDs and roles. The
rules are pinned in planning provenance and the resulting import report records
per-node reasons. Shared defaults are saved separately with CAS; editing them does
not change an existing planning Run. Missing/ineligible routes fail visibly and
leave the coarse Draft intact. Legacy proposals without routing rules retain their
original fixed-binding contract. No retry loop, imported
script or original source path is used by this planning Run.

An expansion result must match the exact coarse revision. The compiler accepts
a finite graph proposal with confidence and valid pinned source spans. It rejects
Provider, write, approval or finalizer authority changes, validates the whole graph
and saves only another Draft under CAS. Invalid proposals leave the coarse head
and its immutable resources intact. Inferred items remain unreviewed and block
launch until explicitly resolved in the editor. The human-only review_import
operation records a reason against each exact dependency observation or inferred
node/edge. Blanket clearing of the inference summary does not clear per-item
blockers. Review creates another Draft, retains requirements and full review history,
and never automatically publishes Ready or claims functional independence.

Remaining integration: graph UI, source/requirement editing and publication, plus
broader executor capabilities. Tests
prove deterministic snapshots, resource relocation, observed dependency blockers,
no script execution, source preservation, stale-selection refusal and expansion
authority/CAS behavior. Actual App Server/local-provider integration additionally
verifies a source-removed synthetic import and selected-Provider expansion. This is
not proof of arbitrary Skill portability or live-model semantic graph quality;
M13 UI/end-to-end and cross-platform release gates remain.

Linked SkillRef nodes now require Strict mode and explicit path/name/source hash,
optional expected version and a flat `allowed_nested_skills` descriptor array.
Run creation snapshots all linked bytes and verifies the entire closure before
publication. Dispatch materializes only per-node allowed snapshots; normal resource
reads never return to the original source. The new Run checks still detect stale,
missing, partial, shadowed or unresolved linked sources.

`inline_skill` saves a new Draft under source revision CAS. It copies root/nested
Skill bytes into `inline/<node>/`, supplies a pinned resource map and converts the
node to editable instructions without changing Provider/access/approval/scope.
An original-source shadow prevents accidental ambient reuse. Requirements and
dependency observations remain visible. The human-only `review_import` operation
must confirm the exact conversion; a separate per-node blocker prevents blanket
summary removal from bypassing review. Functional independence still needs actual
execution evidence. SubWorkflow authority and output rules are in V7_RUN_CONTRACT.

## One-click console generation

The default import review action prepares a managed planning workspace and selects
the planning route from saved rules. The console advances normal claims/dispatch
automatically, one bounded transition at a time, while displaying progress. Provider
gates still require a human decision. A final proposed result and structural graph
validation are shown before explicit acceptance applies the exact source Draft.
There is no implicit retry, Ready publication, approval waiver or guarantee that
arbitrary generated workflows have no bugs. Closing the page stops further UI
advancement, not a model call already dispatched; Run details preserve cancellation
and recovery controls. Workspace/Provider/rules remain editable in advanced options.
