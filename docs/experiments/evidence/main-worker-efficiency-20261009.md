# Main worker efficiency: measured failure and bounded correction

The immutable three-page Skill reference took 158,577 ms and cost $0.193252
under the experiment's fixed external API-equivalent pricing. Its 434,835
input tokens include 389,120 cached tokens. Never rerun or replace that reference.

Run `ddf4d52f-7d55-4968-8c25-17efbb4f6844` delivered three pages but failed
efficiency: 204,819 ms, 785,684 input tokens and $0.4017024. Its initiating Main
used 117,069 input tokens and $0.0682376; its three isolated workers used
668,615 input tokens and $0.3334648. Making Main free would still fail cost.

| Page | Skill page-attributed input | Workflow worker input | Difference |
| --- | ---: | ---: | ---: |
| TCP | 37,356 | 235,435 | +198,079 |
| Cache comparison | 38,969 | 233,043 | +194,074 |
| Git | 123,163 | 200,137 | +76,974 |

These page rows are a responsibility ledger, not three equal isolated trials.
Skill shares setup and acceptance across pages; each Workflow worker includes
its own setup and conclusion. Skill's shared setup used 105,028 input tokens,
and shared verification/copy/final used 130,319. The Git row includes component
help and repair. No worker in this sample demonstrated a page-attributed saving.

The preceding batch's 73.286-second post-worker tail contained about 37 seconds
of mechanical Host work and 36 seconds of Main work. The measured Run above
reduced the tail to 44.373 seconds: Host join 5.904, Main acceptance 21.117,
Host acceptance 2.842 and final Main response 14.510. This remained a failed
whole-batch sample, not an efficiency success.

The failed path included extra catalog discovery, quoted shell wrappers,
incorrect help calls and repairs. Two workers also fetched web material;
Skill's successful reference did not. Main's requests and tool outputs are
counted in full. Context isolation alone does not remove repeated tool/model
calls or make inherited/cache tokens free.

The supported candidate applies these bounded changes:

- Original CLI production takes literal executable arguments and exact UTF-8
  stdin through `run_workspace_program`; no shell-generated wrapper is needed.
- The initial Main route declares `batch_context` containing only common
  requirements. Host combines it with one assigned page, preserving explicit
  page settings and the complete original task for final acceptance. It no
  longer copies the complete batch agenda into every worker's project context.
- Ordinary committed Run metadata reads and state transitions no longer audit
  every resource object. Actual consumers verify selected pinned bytes;
  publication and explicit full audits keep their complete validation.
- Public Main handoffs contain semantic inputs and acceptance conditions. Host
  checker bindings and mechanical receipts remain Host-owned.
- Fresh successful checker completion avoids an intermediate duplicate whole
  workspace snapshot. Receipt reuse and the final commit retain the required
  freshness checks. The original stale-receipt regressions remain preserved.

The normal route uses independent ephemeral Main workers, automatic parallel
item scheduling, one original render per successful production and initiating
Main semantic acceptance. It creates no persistent user-visible worker tasks.
The experimental shared-prefix SDK route is separately blocked before paid
setup because complete usage cannot be qualified; see
[its qualification limits](main-shared-prefix-20261009.md).

Zero-model fixtures, selected tests and installed-byte equality qualify their
stated boundaries only. A business sample must preserve quality while costing
strictly less and finishing strictly sooner than the fixed Skill reference.
Keep full regression until a stable candidate is expected to meet those gates;
do not repeat business or full regression after each small correction.

## Complete r11 failure and cache-accounting boundary

The next complete sample took 190,799 ms and cost $0.4827052. Main consumed
699,861 input tokens across 14 responses; workers consumed 229,338 across ten.
The launch harness omitted the startup contract's bound `inputs`, causing Main
to copy structured pages into its route result, receive a rejection, and recover
with a second Run. All failed startup/recovery cost stays in this sample. The
corrected harness preserves all semantic inputs and deduplicates only an exactly
equal plain request; fixing the harness alone is not an efficiency qualification.

Workers were faster and used 65.7% less input than r10, but their $0.2551888 alone
exceeded the fixed Skill's entire $0.193252. The Git worker's first and third
requests had zero cached input; its second reused 21,504 tokens. Its uncached
input increase explains why cost rose despite fewer responses and less total
input. Three first-response tool-directory discoveries were observed; cache's
discovery shared a response with factual web work, so deleting discovery does
not necessarily remove that whole response.

The 46,619-ms post-worker tail contains 13,709 ms of observed tool waits and
32,910 ms of model continuation or uninstrumented scheduling. Batch observation
and final Host checker receipts each took about 750 ms. Main's later copy into
the app output directory was separate from the existing Host join, which had
already restored every original Run-workspace destination. Skill also copied
deliverables; that shared operation is not Workflow-only overhead. Necessary
final manuscript text is 10,545 bytes and appears once, rather than a duplicated
full resource package. Do not delete semantic acceptance or mislabel all gaps
as Host CPU work.

Archived actual r6/r7/r8 native rollouts establish a different first-response
cache pattern. In all three batches, each child had its own thread ID but shared
the parent's `session_id`; the first child reused zero tokens and the next two
each reused 29,824. This is observed cache-accounting reuse, not proof of the
HTTP request key or free inherited context. The older packets used full upstream
history; that is not a reason to restore `fork_turns: all`. A new isolated native
candidate must receive only its bound page and common semantic constraints,
use the original CLI production/repair loop, and retain initiating-Main acceptance.

SDK workers' owned MCP tools can be exposed through the supported session-local
`features.code_mode.direct_only_tool_namespaces` setting. Preserve the user's
existing entries and verify effective configuration; ordinary direct-mode turns
do not also receive duplicate schema declarations as user text. This fixes tool
exposure, not the independent fresh-session cache-accounting boundary. Focused
checks and zero-model configuration/registration qualify the interface only;
actual initial model tool exposure, reduced responses and business gates still
require a complete measured sample.

External evidence: `G:/Baiduyun/r11-main-worker-diagnosis-20261009/`,
`G:/Baiduyun/r11-main-handoff-readonly-20261009/`, and
`G:/Baiduyun/native-cache-ledger-readonly-20261009/`. Historical rollouts remain
under the user's ordinary `archived_sessions` even where experiment directories
were deleted. Keep the historical Skill unchanged.

## r12 fresh native result and lifecycle reentry correction

The complete r12 native batch delivered its three products, but again failed
the fixed-reference efficiency gates. It used 1,062,330 input tokens, including
916,480 cached, and 9,664 output tokens across 27 responses; cost was $0.479988
and whole wall time was 184,879 ms. The unchanged successful Skill reference
used 434,835 input tokens, cost $0.193252 and took 158,577 ms. Main had 13
responses and the three workers had 5/5/4. Their first responses reused
0/29,568/29,568 input tokens. The actual packets used fresh context and
`fork_turns: none`; they inherited no parent history. Cache-accounting reuse
is an observation, not free input or proof of the HTTP cache key.

The first native batch acknowledgement failed after about 3.5 seconds with
`NATIVE_AGENT_LIFECYCLE_CHANGED`. Its Run journal had armed the child wait at
18:23:01.617Z; one child appended ordinary nonterminal records at
18:23:01.732Z and 18:23:01.923Z before the failed observer audit at
18:23:02.081Z. The same recorded batch was retried and reached final Main
handoff. The failed acknowledgement audited zero resource objects, so this
particular failure was not another complete 73-resource audit. All failed
operation and model cost remains included in r12.

The reader's shared per-thread parser was reentered by the watcher's
`onChange` predicate and its post-arm recheck. A deterministic real-file read
barrier reproduced the cause: both reads started at offset 371 in a file
that legitimately grew to 425 bytes. The 54-byte append was added twice;
the next size check falsely classified the resulting offset as truncation.
The correction serializes each thread's full canonicalization, open, stat,
read, parser/offset update and handle close. A failed caller still receives
its error; a later queued observation runs fresh exact binding checks.
Different child threads remain parallel.

Physical identity replacement, truncation and rewriting to a shorter file
still reject. Errors now distinguish listing/open identity, retained identity,
observed size and unexpected read EOF, carrying the exact thread and bounded
stat/offset evidence in the public error and observer boundary audit. They
contain no manuscript or transcript body. The old reader never promised a
digest of every previously read byte: same-inode, same-size content rewriting
remains outside this existing lifecycle contract. No full-prefix rehash,
global serialization, extra resource audit or hidden retry was added.

The historical error merged three guards and omitted the failing thread and
stat/offset values. The append window and reproduced race do not uniquely
identify which historical child or guard failed. Current captured rollouts
validate all three session/parent/Agent bindings and completed turns; fifteen
listing/open stat pairs agree. Those current observations cannot reconstruct
historical file identity. Preserve that evidence limit.

The correction has 35 focused passes and seven syntax passes for the
concurrency, lifecycle, watcher, authority and observer-diagnostic boundary.
These are zero-model source checks, not a new business sample, full regression,
or an efficiency success. Independent exact-byte review subsequently accepted
the exact delta, and normal version 1.2 installation verified 309 source files
and 230 deployed files. The installed proof is
`G:/Baiduyun/answer-me-with-html-workflow/host-render-upgrade-20261008/installation-1791572870814/installed-proof.json`.
Those gates qualify the reader correction, not whole-batch performance. Evidence is at
`G:/Baiduyun/native-lifecycle-race-evidence-20261009/`; actual read-only r12
anchors are at `G:/Baiduyun/native-lifecycle-r12-readonly-20261009/`.

The [cache and parallelism investigation](native-cache-and-parallelism-20261009.md)
separates shared cache preparation from concurrent branch execution. Under the
immutable experiment rates, even pricing every r12 input token as a cache hit
gives a $0.202873 lower bound, still above the fixed Skill's $0.193252. Cache
improvement alone cannot qualify this unchanged 27-response implementation.
