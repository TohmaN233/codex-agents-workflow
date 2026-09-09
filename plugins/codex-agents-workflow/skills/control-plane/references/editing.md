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
when importing. Skill expansion uses editable skill2workflow classification rules
pinned to the planning Run; configured eligible Providers are assigned per node
by the compiler, never inherited from the planner. Read `workflow_routing_defaults`
for current rules; shared defaults are edited in the console. Import only the selected
entry through `workflow_import_skill`; the result is a full-resource Draft with
visible provenance and unresolved dependencies. Never modify the original Skill.
`workflow_source_status` reports changed SKILL.md hashes without changing any pins.
SkillRef requires exact path/name/hash and explicit nested pins. Inline creates a
new reviewable Draft; a new source version never silently updates an old Run.

User-requested graph/resource edits use `workflow_read`, `workflow_save` and
`workflow_write_resource` under exact revision CAS. The console owns human review
and Ready publication. AI expansion uses a separately selected native Provider in
`workflow_create_expansion_run`; normal Run collection and main acceptance precede
`workflow_apply_expansion_result`. The inferred graph still requires human review.
Static relocation proves pinned resource access only, not functional portability.


