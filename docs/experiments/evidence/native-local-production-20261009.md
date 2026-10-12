# Native producer loop investigation (2026-10-09)

The fixed historical Skill batch remains unchanged. The r6 Workflow batch delivered
all three requested products and passed anonymous actual-artifact quality review,
but failed the user's strict batch cost and wall gates. This is evidence for further
repair, not a completed efficiency qualification.

| Actual subject | Responses | Input tokens | Cached input | API-equivalent USD |
| --- | ---: | ---: | ---: | ---: |
| Skill, whole fixed batch | 11 | 434835 | 389120 | 0.193252 |
| Workflow Main | 14 | 599557 | 547328 | 0.1984908 |
| Workflow, three native children | 8 | 294427 | 239232 | 0.1874632 |
| Workflow, complete batch | 22 | 893984 | 786560 | 0.385954 |

The whole Workflow wall was 219533 ms, against the fixed Skill's 158577 ms. Its
three first producer turns finished by 04:13:25.223 UTC; Main finished at
04:15:12.102 UTC. This later interval includes writing repair, Main generation,
Host checks and calls, final actual-content acceptance, delivery copying and the
final response. It is not all Host CPU time. TCP/cache/Git quality scores were
99/96/97, against frozen Skill scores 96/95/95, without a material regression.

Actual child authoring inputs were 36686–36880 tokens; repaired turns used
38555–38814. The Skill's later inputs grew through 38969–43889. Isolation reduced
the producers' context accumulation; the initiating Main's extra requests outweighed
that benefit. Cache exposure and source renderer versions differ, so this single
historical comparison does not establish a pure architecture causal estimate.

The production split was observable in the graph and service: writers returned
the whole Markdown; a Host completion program rendered it; a warning returned
through Main's followup and acknowledgement before another child was collected.
`native_next` returned immediately on an observed rejection and the persisted
single pending-followup took priority over sibling observation. Thus ordinary
source writing repair became a serial orchestration boundary. Shorter task
carriers and text amendments reduced bytes but did not remove that boundary.

The subsequently installed candidate restores original CLI calls and diagnostic repairs
inside each assigned producer. Host preparation supplies its callable generation
entry and draft address; Host verifies the finished execution and actual artifacts.
The producer returns a concise new conclusion, with final semantic acceptance still
in initiating Main. Source flags, repair budgets, admission, resource/source/receipt
freshness, all routes and the public projection passed focused qualification and
independent source review before normal installation and public publication. The
actual r7 batch below failed efficiency; these checks are not business acceptance.

External immutable evidence: `G:/Baiduyun/skill-vs-workflow-batch-native-r6-20261008/`
contains results.json, full Main/child rollouts, usage, events, path-diagnosis.json,
anonymous HTML, 24 actual PNGs and exact completed SDK quality JSON provenance.
The task-owned temporary Workflow definition was recoverably removed and its chat
archived after collection; Run history, failed gates and produced artifacts remain.

## Mechanical waiting diagnosis

The r6 public `native_spawned_batch` and two correct `native_followed_up` calls
recorded 317, 319 and 232 RunStore operations respectively. Their inclusive drive
times were 36908.529, 22647.193 and 16500.204 ms. The first includes child waiting;
operation samples overlap and are capped, so these values are not additive CPU
measurements. The actual five renderer subprocesses totaled about 2995 ms.

Fresh native `checkActive` originally used complete Run reads, including all 73
resource objects, even though it consumes only journal-derived control, parent,
lease, attempt and rejected-turn state. `readNativeWaitState` now retains current
store admission, cross-process writer locks, full journal hash-chain validation,
state replay, Run identity and committed pins-file hash validation. It returns
only state, events and sequence, without executable pins or resource content.
Actual dispatch, completion, public full reads and mutations retain resource
byte verification. There is no cached state or silent resource-error fallback.

One actual public native collection now owns a lazy observer connection. Recursive
collection reuses transport initialization while SDK identity, turn and lifecycle
reads remain fresh. The connection closes after all started actions settle;
action and shutdown failures remain visible. This scope does not cross public
tool calls, models, Runs or detached actions. The Host records connection count,
RPC counts, phase timings and bounded failure codes, without tool contents.

Neutral read-only qualification used frozen r6 state and terminal SDK threads,
without another model turn or Run. Alternating complete/state reads observed
80/7 filesystem reads and 73/0 resource objects; wall samples were
133.0/66.8/95.0/68.0 ms, with cache effects retained. Four fresh SDK identity reads
within one drive used one connection and about 701.8 ms. Connection setup alone
therefore does not explain the long repair acknowledgements. These measurements
prove narrower mechanical work and actual connection reuse, not a passing batch.

Exact external evidence is retained under the authoring staging directory's
`native-observer-drive-evidence-20261009/`, including
`wait-state-qualified-1791522061357.json` and
`qualified-1791522207951.json`. Eight wait-state checks cover fresh recovery and
cancel, corrupted journal/pins, full-read resource rejection, reentrant writer
use and a real other-PID writer. Observer drive checks cover fresh reads, lazy
initialization, concurrent action settlement, initialization/close errors and
expired-scope rejection. Qualification of the combined local-producer candidate,
normal installation and business efficiency remains separate.

## Actual r7 and history-maintenance interference

The installed local-producer batch delivered all three pages, but used 226386 ms,
959257 input tokens (848768 cached), 8224 output tokens and 24 model responses.
Its API-equivalent total was USD 0.3880948. Main used 13 responses and USD
0.1860276; the three children used 11 responses and USD 0.2020672. Whole cost,
wall and input gates failed. Quality is not qualified for this failed candidate;
the earlier r6 artifact scores do not transfer to r7.

Children finished by 06:00:58.970 UTC, while Main finished at 06:02:30.952 UTC,
another 91982 ms. Two actual batch-registration calls returned
`RUN_STORE_ADMISSION_TIMEOUT` for the global store-operation writer. Main retried,
discovered tools and waited, and then registered successfully. All those responses
are included. No corrected or overhead-subtracted total replaces the measurement.

The initial `start_prepared` recorded 197 Store operations and 35557.522 ms; the
successful batch acknowledgement recorded 386 operations, including 229 reentrant
operations, and 42441.974 ms. Actual observer RPC evidence shows seven thread reads
totaling 21.822 ms and six turn-list calls totaling 253.005 ms. Its whole drive
was 40382.079 ms. Inclusive Store phases overlap and cannot be summed as CPU time.

The retained maintenance receipt identifies job
`057aacd4-e711-4758-9c2f-552254409b4a`, owner PID 9632, worker PID 46476,
created 05:59:29.852 UTC and finished 06:00:53.315 UTC. It examined 145 historical
Runs and deleted zero. Both acknowledgement timeouts fall within that interval.
The old maintenance implementation performed full resource and recursive history
audits under the foreground global admission. Temporal overlap does not identify
the exact owner at either timeout; the original audit did not retain that field.

The repair separates maintenance classification from deletion authorization and
removes duplicate full reads within one short verified transaction. Pure journal
observations do not grant resource authority; external producer/checker effects
still require fresh execution verification. Source qualification, exact normal
installation and a new actual batch remain required; r7 is not relabeled passing.

An intermediate neutral public-ACK fixture with 73 pinned resources still made
67 full resource audits (4891 resource objects), 243 Store operations and 93
distinct admissions. Its measured 21573.536 ms is not business performance.
Caller tracing found 26 full audits in the generic mutation/writer path, including
native metadata-only transitions. The next repair uses fixed Host-owned typed
journal transitions for native lifecycle, usage and Host receipt metadata. Each
checks fresh journal/pins and its controller, lease, receipt and schema under the
original guards; no caller-controlled skip-audit switch or cross-call resource
cache is introduced. Execution and semantic completion retain fresh full audits.
The native observation interface accepts only fixed pure lifecycle events bound
to an active cooperative native attempt and snapshots input before admission.
Ordinary executor events outside the three exact Codex observations, and ordinary
managed joined receipts, retain their complete resource-byte audits.
The subsequent same-fixture installed/current samples recorded 79/38 full audits,
5767/2774 resource objects, 262/206 Store operations and 99/85 distinct admissions.
Their single wall samples were 23086.310/17813.391 ms; they are retained without
normalization and do not establish actual webpage time or cost. These measurements
also show that resource-audit counts and all Store operations are different facts.
The new paired measurement and focused qualification are retained externally at
`G:/Baiduyun/native-handoff-lock-evidence-20261009/`; installation and business
acceptance remain distinct.

Immutable r7 metrics, rollouts, events and path diagnosis are under
`G:/Baiduyun/skill-vs-workflow-batch-native-r7-20261008/`. Its temporary Workflow
definition was recoverably removed and its initiating chat archived after complete
usage collection. Actual Run history, artifacts, failures and full cost remain.

## Actual r8 and repeated wait/transaction work

The next normally installed candidate delivered all three pages without the r7
admission timeouts or Main retries. It still failed the batch efficiency gates:
242416 ms, 733278 input tokens (629248 cached), 7579 output tokens, 19 responses
and USD 0.3467748 API-equivalent. The fixed Skill remains 158577 ms and USD
0.193252; it is not rerun. Quality for r8 is unqualified, and earlier artifact
scores do not transfer.

Main used nine responses and USD 0.1494668. The three children used ten responses
and USD 0.197308 in total. Child per-response context can be smaller while total
cost grows through additional responses and actual uncached input. A reduction
in filesystem work does not prove a reduction in model responses or cost.

The initial prepared start took 45466 ms. All three children overlapped, with
individual turn lengths of 76045, 72915 and 57311 ms. Main completed 93226 ms
after the last child. The 93167 ms acknowledgement includes legitimate child
waiting; it is not all Host execution time. Main's tool intervals cover 154410
ms of the whole turn. The remaining 88006 ms includes generation, scheduling and
uninstrumented time, rather than measured CPU time.

The actual acknowledgement recorded 588 Store operations, 274 distinct admissions,
157 native wait reads, 63 full audits and 4599 resource-object reads. Seven SDK
actions shared one connection; 52 thread reads totaled 669.63 ms and 51 turn-list
reads totaled 1283.04 ms. Nested phase times overlap and must not be summed. The
external evidence selector initially retained only foreground-operation records;
a separate complete boundary observation preserves the existing Store-method and
SDK diagnostics without rewriting the earlier artifact.

A focused actual-parser/lifecycle public fixture demonstrated progress-driven
amplification. Immediate terminal results required 269 Store operations, 117
distinct admissions and 34 native wait reads. Adding only five ordinary
`token_count` appends before the same terminal results required 471 operations,
218 admissions and 129 native wait reads. Both runs performed 36 full audits,
read 2628 resource objects, accepted the same three items and produced the same
final handoff. This proves a wait-path mechanism; it does not reconstruct the
unrecorded number of progress wakes in r8 or establish business savings.

The implementation under revision must remove global writer admission from exact
single-Run read-only wait observation and distinguish durable progress from
terminal lifecycle changes. Quiet-child cancellation and lease/controller
changes still need a Run-journal wake. Short synchronous Run transactions must
reuse their exact audited record, then end before external work and retain fresh
full resource checks at executable use, after effects and semantic acceptance.
Caller-controlled audit bypasses, cross-call state caching and prompt-based
waiting rules do not satisfy this boundary.

Immutable r8 metrics, owner rollouts, events, method counters and timing diagnosis
remain under `G:/Baiduyun/skill-vs-workflow-batch-native-r8-20261008/`. Its temporary
definition was recoverably removed and its initiating chat archived. The Run,
products and actual usage remain. The read-only diagnosis and actual lifecycle
fixtures are retained under
`G:/Baiduyun/native-handoff-lock-evidence-20261009/r8-readonly/`.

## Native startup and final delivery interface facts

A separate read-only API/source inspection confirms that the cooperative bridge
returns individual `collaboration.spawn_agent` calls for initiating Main to
execute. The current App Server schema has ephemeral `thread/fork`, but no native
batch-spawn RPC. That fork has not been shown to provide the required native
parent/agent-path identity and ordinary tool inheritance. Host-owned Main uses
ephemeral `thread/start` with compact context and configured tools; its current
client allowlist does not expose `thread/fork`. These are current interface
facts, rather than proof that a different executor would be faster or equivalent.

The succeeded r8 Run's committed output already contains `accepted: true` and the
Main-authored `semantic_result` with all three actual absolute page links. The
success reply discarded that output and returned only terminal status flags.
Main then copied files into its app outputs and ended with a sentence omitting
links. The generic terminal interface must preserve the committed semantic output
after acceptance, without inventing artifact fields, destinations or another
model handoff. Success projection must be consistent across orchestration, native
continuation/ACK, ordinary drive and wait. Failure, cancellation and recovery keep
their original diagnostic and continuation semantics. Node-result size limits do
not establish an aggregate output bound; links must not be silently truncated.

The read-only API facts and exact source pins are retained externally under the
authoring staging directory's `native-interface-facts-1791536361840/`. The output
return repair is not yet a passing business efficiency measurement.

The scoped implementation checks cover pure single-Run waiting, progress-aware
collection, short audited transactions and successful terminal output. Their
first frozen set has 190 passing checks, with intermediate failures preserved.
In the same 73-resource public fixtures, prepared startup changes from 69 audits,
5037 object reads, 164 Store operations and 75 admissions to 36, 2628, 80 and 38.
The final startup count consists of 29 Run-store audits and seven Workflow-store
audits. The five-progress-event continuation changes from 36 audits, 2628 object
reads, 471 operations and 218 admissions to 24, 1752, 187 and 77; SDK thread reads
change from 36 to six, and turn-list reads from 39 to nine. Final acceptance still
performs four full audits of 292 objects and returns the exact committed output.
These are scoped mechanism measurements, not measured business cost or wall-time
savings. The remaining full audits retain their contract boundaries; lower counts
alone do not authorize removing them. Independent review of that frozen set
found one post-arm race: a quiet Run journal commit between the first authority
check and watcher registration could be missed. The repair must recheck fresh Run
authority after registering both watchers and before sleeping. The original
190-check closure and its review retain their original source scope; a separate
repair qualification records the checks actually rerun for this correction.

## Actual r9 dependency-path diagnosis

The normally installed race repair completed r9 without an admission timeout,
but the batch still failed all efficiency gates: 218247 ms, 733320 input tokens
and USD 0.3177464, versus the immutable Skill baseline's 158577 ms, 434835 input
tokens and USD 0.193252. The three native writers overlapped. After the last
writer completed, Main needed another 73286 ms before its final reply. The actual
raw reply contains all three page links; the app status summary omits Markdown
links and must not be used to infer missing delivery. Copying and hashing outputs
also occurs in the fixed Skill baseline, so it is not Workflow-only overhead.

The real declared Node dependency selects paths absent from the earlier neutral
fixtures. Startup performed 47 full audits (3431 resource-object reads), native
ACK performed 59 (4307), and final acceptance performed 10 (730). The actual
resource-program and broker callback repeatedly prepare the same environment;
executor branches enter full transactions only to return to a fallback because
requirements are present. Native sibling advancement re-enters public preparation,
and adjacent receipt transitions reread the same scoped state. These reachable
call chains explain redundant work. Aggregate counters do not identify each
individual read or prove a particular external lock owner.

The next repair closes the whole dependency path: select branches from the
current audited state; release guards for environment and external work; freshly
authorize before scoped plan/intent commits; preserve actual executable/path
verification in the real broker; advance adjacent siblings and receipt state from
the current durable projection. External effects, span-file processing and
semantic acceptance retain their required fresh boundaries. Fixed boundary
read-purpose counters make the path observable. Qualification must exercise
73 resources, an actual Node requirement, the actual resource-program/broker
callback, three disjoint native writers and the final Host checker. Earlier
dependency-free counters retain their original limited scope.

The observed final Main read targets a declared semantic input file beneath the
orchestration inputs directory, with a 14724-byte serialized tool reply. It is
not the orchestration task index; enlarging that index's existing 12000-byte
inline threshold alone cannot remove this round trip. A bounded generic carrier
must deliver that same already validated public semantic input, with exact UTF-8
bytes and canonical references for larger values. It must not expose private
execution state or forward sibling drafts into future child context. No new
batch-spawn RPC, child-context contract or executor switch is part of this repair.

The actual child cost alone was USD 0.202486, already above the whole Skill
baseline cost. Host I/O reductions alone cannot establish cost parity. Keep all
Main/child requests and repairs in the next actual ledger, and require measured
cost and wall-time success before claiming the Workflow is better.

Immutable r9 measurements are retained under
`G:/Baiduyun/skill-vs-workflow-batch-native-r9-20261008/`; the frozen source/evidence
diagnosis is `G:/Baiduyun/native-r9-root-diagnosis-20261009/diagnosis.json` (SHA256
`30df208abec07d095cb12c93ca05fe4656e8917d8973b9f69c8be120e4df5496`).

## Main worker completion and parallel dispatch

The separate Main-worker candidate preserves the original 73 resources, CLI,
routes, repair bounds and initiating Main acceptance. Its parallel item sessions
are dispatched directly by the Host. This changes the executor and context
delivery from the native candidate; it is a separate comparison, not evidence
that the native batch passed. No performance or quality claim follows from
zero-model request-shape or command fixtures.

The initial real CLI/checker compatibility attempt failed final admission. All
three checker receipts succeeded, but session closure subsequently removed the
owned command-spool and runtime-temp directories. The checked whole-workspace
snapshot therefore differed from the final workspace. The exact diagnostic
found only those directory deletions; product, resource and receipt bytes were
unchanged. Final freshness rejection was correct for the captured snapshot,
and retrying the model or omitting directories would conceal the lifecycle bug.

The required lifecycle settles and cleans the exact command generation after
the model turn terminates and before running the checker. The model session
remains available for a rejected check's correction. Only the next corrective
turn creates another command generation, with cumulative command audits.
Successful final closure must then be idempotent with respect to workspace
effects. Whole-workspace freshness and late-write rejection remain unchanged.
Cleanup or unconfirmed shutdown errors must remain visible and prevent
acceptance. This applies to both ordinary Main workers and parallel items.

Independent inspection also identified an ordinary-worker audit gap: the SDK
result describes one turn's commands, while the session retains all settled
generations. Saving only the final result loses earlier correction commands in
the durable Run artifact. The ordinary manager now merges the exact session's
settled audits by process identity after closure, on both success and failure,
and preserves the SDK's per-turn contract. The parallel manager already merges
those session audits. The affected final checks comprise 29 executions and 25
unique cases; earlier checks retain their original source scope and are not
counted as executions against the final bytes. These checks establish lifecycle
and trace retention, not the business cost, time or quality gates.

The normal Windows command-spool attempts initially lacked a terminal runner
receipt. Controlled zero-model comparisons subsequently isolated the cause to
the projected TMP environment: ordinary inherited TMP and the same long
TEMP-only value completed, while TMP-only and TEMP+TMP values under the deeply
nested command capture directory stalled before the runner's first statement.
Both direct process launch and the ordinary command-only App Server reproduced
that distinction. This establishes the responsible environment projection, not
a particular Windows API or universal path-length threshold.

Command generations now allocate an exclusive short temporary directory beneath
the physical platform temp root, retain its exact ownership and directory
identity, project TEMP/TMP to that leaf, and verify ownership before strict
cleanup. Actual workspace cwd, command captures and product destinations are
unchanged. Restricted command policies add only that exact technical leaf; the
parent temp directory is not a writable root. Allocation and OS qualification
precede model execution; the declared default shell is mechanically preflighted
there, while a later custom shell is checked before its first command. Failed
qualification, ownership or cleanup must surface with preserved diagnostics.

A real three-slot original-CLI compatibility check completed all commands,
settled owned command generations before the original Host checks, and passed
join and worker freshness without additional rendering or model turns. Its
fixture semantic SDK and mechanical final admission cannot establish initiating
Main business quality. The actual comparison retains the fixed Skill baseline
and must include initiating Main, every worker and correction, startup, command
closure, acceptance and final delivery in its cost and wall-time gates. Actual
workspaceWrite OS qualification remains a separately failed platform probe;
the inherited danger-full-access experiment does not certify restricted OS
isolation.

## Actual Main r10 diagnosis, 2026-10-09

The real three-page Main-worker comparison failed: 204,819 ms, 785,684 input
tokens and USD 0.4017024 API-equivalent, versus the fixed Skill's 158,577 ms,
434,835 input tokens and USD 0.193252. No Skill business execution was repeated.
Three workers used 26 responses and USD 0.3334648; initiating Main added three
responses and USD 0.0682376. The old native r9's settled-child delivery tail was
73.286 seconds; r10's last settled worker-session-to-delivery interval remained
44.373 seconds. Those are different recorded boundaries, not model-only timing.

The ordinary Main path performed 248 full resource audits, reading 18,104
resource objects. Its startup_handoff span includes the complete parallel
production and is not a serial audit-time measurement. Full object scans on
state reads, authority checks and event mutations are unnecessary. The generic
Store contract is being changed to fresh journal/pins integrity for state,
and bounded declared-hash verification at the actual object consumer. Explicit
whole-package audits retain complete scans. This supersedes earlier claims in
this investigation that every authority and acceptance read must rescan all
resources; cancellation, current leases and product checks remain necessary.

Workers also repeated tool discovery, read adapter/recipe/baseline metadata,
called unsupported entry --help, and wrote shell wrappers. Their exact schemas
and callable names had already been supplied identically; missing or varying
tool names did not cause the observed repeated discovery. A generic literal
argv and UTF-8 stdin/EOF command API removes shell wrapping without changing the
original production entry or STE rules. Its real-process focused checks pass;
this does not yet establish a business improvement or eliminate model discovery.

The read-only evidence is in `G:/Baiduyun/r10-main-worker-diagnosis-20261009/`.
The diagnosis manifest SHA-256 is
`a41e5980fb58fbdc2769c6bd9461e9624be12935988e63f13aef1a71d8fadcf3`.
Per-response counters are complete; full ephemeral response/tool bodies and
exact per-read stacks were not retained, so attribution does not invent them.
The failed temporary Ready definition was moved to recoverable storage after
capturing its Run, ledger, products and diagnosis. Production was not overwritten.
### 2026-10-09 terminal presentation and duplicate scan correction

The r10 initiating Main used three responses and two tool calls. Its last settled
worker to final reply tail was44.373s: Host join/handoff5.904s, semantic acceptance
and call emission21.117s, Host acceptance2.842s and final reply14.510s. The older
r9 tail was73.286s. These are separate samples; do not call the full tail Host
scan time or infer a new candidate speed pass from either.

Automatic checker metadata and its mechanical instruction are now private to
the Host; the actual semantic inputs and automatic checker execution are kept.
Four selected orchestration cases passed after that presentation change.

For a newly executed successful final checker, the executor no longer repeats
the whole-workspace freshness capture before definitive Runtime acceptance.
The Runtime commit still compares the stored snapshot with current content.
Reconciliation of an existing receipt still checks freshness before constructing
another immutable proposal. Five selected changed-content/reconciliation cases
passed. The first blanket removal exposed a different proposal-conflict error
on a stale retry; its failed log is retained and the operation-boundary
distinction fixes that cause. This change removes one successful final scan;
it does not claim a measured wall-time reduction or remove all scope checks.

Frozen read-only reports are under
`G:/Baiduyun/main-terminal-handoff-diagnosis-20261009/report.json` and
`G:/Baiduyun/main-check-snapshot-diagnosis-20261009/report.json`.
