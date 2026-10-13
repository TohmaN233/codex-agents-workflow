# Native cache preparation and parallel branches — 2026-10-09

## Mechanisms and the measured failure

Context isolation keeps one branch's manuscript and tool results out of the
other branches. Parallel execution overlaps their work; it does not itself
remove billed tokens. Prompt caching reuses an exact rendered prefix at a
reusable cache boundary and charges the cached-input rate. Separate contexts
can reuse a prefix without inheriting a parent transcript. Total input usage
still includes each request's cached prefix.

The complete r12 sample had three fresh/none children. Their first-response
cached tokens were 0 / 29,568 / 29,568. Main issued the three spawn calls in
three different responses; the third launch was 17.260 seconds after the
first. These observations are compatible with a warmed sibling prefix, but
do not identify the cache writer, actual HTTP settings or cache affinity.
There is no simultaneous-spawn counterfactual here. Do not claim that three
concurrent spawns necessarily miss, or that the three model rounds were a
required cache policy.

The shared 3,957-byte format reference reached each child in its first task
file tool result, after branch-specific inputs. The initial cache hits
therefore do not establish reuse of this shared business document. Identical
bytes in three files are not sufficient: both their preceding rendered
context and the cache lookup boundary matter.

Main had 13 responses and workers had 5 / 5 / 4, versus 11 responses for the
fixed Skill. Under the immutable external experiment rates ($0.1 per million
cached input tokens and $10 per million output tokens), an intentionally
unattainable optimistic bound is:

```text
all-input-cached cost floor
  = 1,062,330 × 0.1 / 1,000,000 + 9,664 × 10 / 1,000,000
  = $0.202873 > fixed Skill $0.193252
```

This is a diagnostic lower bound, not a revised bill. Actual r12 remains
$0.479988 and 184,879 ms, with failures included. Improving caching alone
cannot pass the unchanged request/output volume. Pricing and measurement
stay outside Workflow nodes.

## Available interfaces

The pinned official Codex source permits multiple independent tool calls in
one model response. The spawn handler briefly serializes its own startup
operation; this does not require a new model response per child or serialize
the running child models. The native public spawn accepts one message and
one task name; there is no qualified public Host bulk-creation operation.
Workflow's `native_spawned_batch` records existing children and waits; it
does not create them. Same-response calls are supported, but the current
plugin cannot mechanically guarantee the caller emits all three together.

The inspected V2 `preserve_fork_prefix` applies to history forks, not fresh
`none`. Its parser also accepts numeric legacy `fork_turns` values as full
history; those numbers do not select a narrow common turn in this pinned
implementation. Do not use a numeric value or a full parent fork to pretend
the unrelated Main context was excluded.

The current Responses API documents explicit common-prefix cache boundaries
and `prompt_cache_options.prewarm: true`: prepare a prompt without generating
output, wait for completion, then send requests with the same prefix. The
write and reads remain billable. This supports the desired architecture at
the API layer; it does not establish availability through Desktop native
spawn. The public native spawn parameters and inspected App Server boundary
do not expose those controls. Do not inject guessed config keys or switch
the benchmark's runtime silently.

Codex's internal `prewarm_websocket` sends `generate=false` for connection
setup and reuse of a connection/previous-response identity. Its source
explicitly describes it as connection setup. It is not a qualified shared
KV-cache completion receipt for these native children.

## Execution direction

The intended boundary is:

```text
Host builds canonical common instructions / references / stable tool surface
                       ↓
qualified common-prefix cache preparation completes once
                       ↓
           A(common + A input) ┐
           B(common + B input) ├ concurrent branch work
           C(common + C input) ┘
                       ↓
         Host mechanical collection → Main semantic acceptance
```

Only branch-specific semantic inputs and exact scope belong after the common
boundary. Main conversation history, other item results and changing task
paths must not enter it. Preparation is a transport capability, not another
reasoning agent, safety review or delivery node. If a runtime cannot expose a
qualified preparation boundary, report that limitation; never pretend a
connection warmup or fixed sleep supplies it.

Native launch batching and common-prefix preparation are separate gaps.
Reducing Main metadata/relay rounds and repeated worker setup is necessary
regardless of cache capability. Common preparation, all Main calls, child
calls and retries remain in whole-run cost/time accounting. No paid run was
started for this investigation; no Skill baseline was rerun.

## Evidence

- Actual path and per-response ledger: external consolidated experiment
  evidence `r12-native-path-diagnosis-20261009/report-sealed.json` and
  `ledger.tsv`; r16 cache/accounting evidence `r16-cache-accounting-20261009`.
- Fixed-commit Codex source and exact cache observations: external evidence
  `r12-native-cache-boundary-20261009/report.json`. Machine-local evidence
  directories are not runtime dependencies or portable resource locations.
- Official [prompt caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching)
  and [cache diagnostics](https://developers.openai.com/api/docs/guides/prompt-caching/diagnostics),
  checked 2026-10-09. Public API documentation is not deployed Desktop proof.
- Pinned [spawn parameters and fork parser](https://github.com/openai/codex/blob/36ae1561b9324c93d5638b45eb19fe2cc070a581/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs#L268-L309),
  [prefix preservation](https://github.com/openai/codex/blob/36ae1561b9324c93d5638b45eb19fe2cc070a581/codex-rs/core/src/agent/control/spawn.rs#L1116-L1119)
  and [connection warmup](https://github.com/openai/codex/blob/36ae1561b9324c93d5638b45eb19fe2cc070a581/codex-rs/core/src/client.rs#L17-L21).

## Corrected acceptance boundary — 2026-10-10

The earlier categorical promise that native parallel branches would share
cached context was unsupported. Matching visible instructions are necessary
evidence, not a cache-completion receipt. Native `fork_turns:none` preserves
isolation and can reuse a prefix, but cannot guarantee a shared cache lookup.
Neither changing a task name nor a fixed sleep proves cache readiness.

The complete r16 sample delivered all three products and its fresh anonymous
artifact review found no material quality regression. It nevertheless failed
both business gates: $0.3765324 and 171,846 ms, against the unchanged historical
Skill's $0.193252 and 158,577 ms. Its 434,898 input tokens were essentially equal
to Skill's 434,835; 297,344 were cached versus Skill's 389,120. The first two
Main responses consumed 71,500 fresh tokens; why the second response missed
remains unproved. Exact rendered HTTP tools/prefixes and backend routing are
not exposed by the inspected native interfaces.

Deleting the two extra spawn-response rounds would still leave $0.3562976.
Even the first two Main responses and first response of each worker already
cost $0.2055984, before writing and acceptance. These are diagnostic bounds,
not bills, proposed omissions or a reason to rerun the fixed Skill. Host
latency corrections alone cannot establish cost acceptance.

The supported API design requires an identical canonical prefix and tool
ordering, a billable completed common-prefix preparation, branch inputs
following that prefix, and overlapping branch requests. Cache writes, each
cached read, Main and failed calls all remain counted. `prompt_cache_key`
does not pin a machine or guarantee a hit; public API capability does not
establish availability in Desktop native spawn. The inspected prediction
fork inherits persisted parent history/config/tools and cannot combine that
mode with turn truncation; it cannot satisfy a common-information-only fork.

The current native boundary has two independent limitations: no Host bulk
spawn operation, and no qualified common-prefix preparation/receipt. Multiple
spawn calls in one response are supported, but their grouping remains a model
action. Do not represent stronger prompt wording as a deterministic adapter.
Any future transport capability must pass interface and complete-usage
qualification before a paid cohort, preserving the selected runtime/model
and ordinary tools. No hidden warming or unreported runtime switch is allowed.

The current Host correction separates real mechanisms from those limitations:

- Exact repeated usage validates authority/schema/conflicts but does not add
  timestamp-only journal events. It does not remove the fresh authority read.
- Already published pending repair and incremental follow-ups share verified read-only replay, with
  unchanged packet, span, root owner and fresh controller/lease checks. Missing,
  changed or unsettled publication evidence fails; no task materializer runs.
- Implicit scoped dependency verification compares the actual pinned scope,
  permissions, active attempt, lease hash/generation, admitted environment,
  requirements and paths. Unrelated progress may advance the Run journal.
  Explicit caller sequence CAS remains strict, and cancellation/revocation
  still prevents execution.
- Independent native checker admission and collection require separate
  Host-derived slots while retaining ordinary attempt exclusivity, duplicate
  slot rejection, failed cleanup ownership and cancellation/draining all
  started slots. Actual neutral Node overlap and incremental repair behavior
  are qualification requirements, not optional performance assumptions.

These changes require targeted tests and fresh source review; source or neutral
qualification is not an installed-byte proof or a passing business experiment.
The fixed baseline, failed ledgers and terminal artifacts remain immutable.

## Tool inheritance and measured component limits — 2026-10-10

The ordinary SDK catalog silently assigned `shell_type: disabled` even when
authenticated model metadata selected `unified_exec`. This replaced the
source's ordinary command interface with owned Workflow command tools. The
runtime now preserves the explicit native shell alongside the existing owned
resource/program broker. Missing legacy metadata retains its old adapter;
it does not establish an observed native capability. Strict uses its separate
existing path. This correction lives in the runtime, without an execution
prompt exception or a workflow-specific shell setting.

Native commands inherit the caller's command policy and session lifecycle.
Logical item assignments are not operating-system isolation or broker
enforcement over native commands. Exact thread/turn/item observations retain
command audits, including failed and corrected turns; duplicate completion
notifications do not add duplicate audits. Invalid usage still rejects, retaining
its command evidence. Raw command items do not become public result payloads.
Pending native process settlement has not received an additional guarantee.

Fifty focused tests and independent read-only review qualify these boundaries.
Normal installation retained version 1.2 and verified deployed bytes. Those
results do not prove business performance or quality. Installing the change
released connected MCP processes; actual management and execution calls then
returned `Transport closed`, including a later ordinary Main turn. A standalone
handshake or SDK component cannot certify recovery of that Desktop connection
or substitute for official Run authority.

The qualified Main common-source mechanism used same-client ephemeral prediction
forks from a common-only source. An external parallel producer component recorded
three starts within 66 ms. Initial TCP, cache and Git requests contained 16,981,
16,984 and 16,985 input tokens respectively, with 16,256 cached tokens each.
Common preparation was billed once, not free. The initial
preparation catalog must match the child declarations even when the preparation
phase denies tools. The earlier r17 catalog mismatch failed before page work;
its $0.183818 and 72,297 ms remain a failed sample, not a cache qualification.

The successful parallel producer component cost $0.1254696 in 73,314 ms, before
the actual Run launcher, coordinator and initiating Main. Separate route/final
Main semantic work cost $0.0842804; summing their known costs gives $0.20975,
above the frozen Skill's $0.193252. Their active durations are not whole-Run
wall time. The parallel component predates the native-shell correction.

Attributing the actual frozen Skill requests to their observed operations gives
a more specific explanation than the earlier Main-only attribution. TCP and
Git production in that parallel component saved $0.0034344 and $0.0213668.
Redis/Memcached production added $0.0378964 through two long retrieval rounds;
Main plus common preparation added $0.0034028 against Skill preparation and
delivery. This is measured stage attribution, not an unchanged-path causal
counterfactual. The artifacts and request ledger support the decomposition;
they do not authorize removing ordinary tools or overwriting the fixed baseline.

A later grouped producer component used the corrected native catalog and
returned all three manuscripts from one ordinary SDK thread. It cost $0.1734372
in 136,887 ms, including an original STE correction. Three long web calls exposed
95,007 UTF-8 result bytes. With the separately measured Main, its known cost is
$0.2577176 before coordination. Grouping therefore failed its budget and was
not adopted; it also lacks per-page context isolation and parallel production.
Neither component is a passing whole Workflow cohort. The current Ready graph
retains independent parallel items, the original renderer/repair boundary,
one Host product observation and initiating-Main semantic acceptance.
