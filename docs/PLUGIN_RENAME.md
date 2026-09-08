# Codex Agents Workflow

The plugin, source directory and local marketplace identity are renamed from
`sol-advisor` to `codex-agents-workflow`. The GitHub repository remains
`codex-agents-workflow`. This branch has not yet been published to the remote
marketplace.

Install `codex-agents-workflow@codex-agents-workflow` from the updated local marketplace. The new plugin opens
the same `$CODEX_HOME/sol-advisor` store; configuration, Workflow Packs, revisions,
Run journals, recovery identities and backups remain in place. This is compatibility
reuse, not a second empty store or an automatic migration of user policy. Do not run
two active controllers against the same Run. Disable the old plugin when switching
to the renamed installation, and start a fresh Codex task to load its tools and skills.

The `codex-agents-workflow` MCP identity is now canonical. Legacy native role
files and existing Provider IDs remain stable as compatibility keys, not model
selection. Historical qualification evidence is unchanged.

The primary model has no eligibility restriction, reasoning floor or startup model
recommendation. Strict finalizer proposal settings accept explicit model and effort
identifiers; unavailable selections fail through the executor instead of substituting
another model. New defaults use GPT-6 Astra / medium. The new read-only reviewer role
is `codex_workflow_reviewer`; the old three role templates stay byte-identical for
existing user bindings. Installation does not rewrite configured Providers or Run pins.

New Strict authentication defaults to `host_chatgpt`, which reuses the current
official Codex login. Existing configurations retain their saved mode; select
`host_chatgpt` in Execution Capabilities to switch. A credential-only official
App Server obtains short-lived access credentials through private stdio RPCs,
then each isolated node receives external credentials in memory. No auth.json,
refresh token, cookies or host configuration are copied into node profiles.
Credentials are never Workflow inputs, resources or logs. Missing/expired login
fails visibly and does not open a login page. `managed_chatgpt` remains an explicit
alternative for separate manual login; changing authentication modes during an
active attempt invalidates that attempt's authorization.

The qualified Codex 0.145.0 account catalog observed during acceptance does not
currently list `gpt-6-astra`. The default remains Astra/medium; this availability
failure is explicit and does not substitute another model. Existing user-selected
Luna and Terra executors were tested separately.

The latest local acceptance build is `0.8.0` (the cachebuster suffix is installation
metadata). All 207
control-plane tests, both repository verification scripts and plugin validation
passed. Actual browser runs covered immutable resources, Main acceptance, recovery,
both condition outcomes, parallel reads/writes, child workflows and native handoffs.
Small-Skill AI expansion passed after planning and Main review were given the full
pinned reference snapshot; application still creates an unreviewed Draft.

Complex video-use AI proposals were not accepted. An explicitly user-approved
Cooperative Main copy runs the real host media pipeline; this does not qualify
Strict media execution. Its 338-second silent tutorial preview passed the second
QA stage after one evidence-based repair and awaits user preview confirmation.
New-model availability, final video
acceptance and remote release remain separate from these successful checks.
