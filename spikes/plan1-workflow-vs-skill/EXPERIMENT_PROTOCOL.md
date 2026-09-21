# Plan 1 comparison protocol

Status: `DRAFT_PENDING_USER_CONFIRMATION`. Native feasibility is proven; no model comparison arm has run.

Four task-specific Workflow Packs are now registered as Drafts. Every `agent` node uses `executor.kind = main`; no Provider, worker, thread, or sub-Agent executor appears in these graphs. The graphs may contain deterministic host-tool nodes for input preflight, shared public helper execution, and public validation. Those are not Agent nodes and the exact same wrapper surface must remain available to all four experimental arms. Draft status and unavailable wrapper registrations prevent accidental launch while the comparison plan is under review.

## Question and claim boundary

The primary question is whether converting a task Skill into a host-driven Workflow reduces total online model tokens on four concrete, implementation-qualified tasks without reducing task success or verifier quality. The result is a four-case demonstration, not a claim that every Skill should become a Workflow.

Trigger correctness is tested separately. Planning, audit, comparison, experiment design, and merely mentioning the plugin must not start a Run. A concrete end task may start only a directly matching Ready Workflow.

## Four implementation-qualified tasks

Source: `benchflow-ai/skillsbench@b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af`.

There is no random task selection. A task enters this experiment only after its actual source package has run successfully on the selected platform and its verifier has rejected a missing required artifact.

1. `crystallographic-wyckoff-position-analysis`
   - Local inputs: 11 CIF files.
   - Workflow shape: parse structure → compute symmetry/Wyckoff labels → count multiplicities → rationalize representative coordinates → expose the required Python function.
   - Native evidence: oracle exit 0; verifier 11/11; missing `solution.py` rejected.
2. `earthquake-plate-calculation`
   - Local inputs: earthquake GeoJSON, plate polygons, and plate boundaries.
   - Workflow shape: load → spatially filter Pacific Plate → project → calculate boundary distances → select maximum → serialize JSON.
   - Native evidence: oracle exit 0; verifier 8/8; missing `answer.json` rejected.
3. `lake-warming-attribution`
   - Local inputs: four frozen CSV datasets.
   - Workflow shape: trend analysis → merge drivers → derive radiation → standardize/factor analysis → contribution calculation → write two CSV outputs.
   - Native evidence: oracle exit 0; verifier 2/2; missing trend output rejected.
4. `video-silence-remover`
   - Local input: a frozen ten-minute MP4.
   - Workflow shape: extract audio → calculate energy → detect opening and pauses → combine removal segments → render compressed video → generate report → validate media/report consistency.
   - Native evidence: oracle exit 0; verifier 9/9; missing compressed video rejected.

All checks used WSL Ubuntu, Python 3.12.13, Bubblewrap, no Docker, and no task-time network. Evidence is recorded in `native_feasibility_report.json` and `feasibility-receipts/`.

## Experimental arms

The abbreviations are defined here and used consistently afterwards:

- **N-main — No-Skill main-agent baseline:** the same main Agent receives the task, inputs, common tools, and thin wrappers, but no Skill body and no Workflow graph.
- **S-main — Skill main-agent baseline:** the same main Agent receives the original frozen Skill resources in addition to the same task, inputs, tools, and wrappers.
- **W-control — Workflow control:** the converted Workflow graph runs after all of its Workflow-native resources are preloaded into the fresh main-Agent context. This preserves the graph and host-tool behavior while disabling node-scoped resource projection.
- **W-main — Workflow main treatment:** the same converted graph runs with only each claimed node's declared Workflow-native resources read into the fresh main-Agent context.

`main` means that every semantic judgment stays in one continuous main-model session. No cheaper submodel or independent Agent is introduced in this comparison.

All arms receive identical input bytes, public helper code, permissions, deadlines, compute, and tool versions. Oracle and hidden verifier remain judge-only. The Workflow may encode ordering, bindings, schemas, and stopping rules; it may not contain task answers, oracle values, hidden tests, or a new algorithm unavailable to the other arms.

Each candidate run uses a fresh Codex task and a fresh write workspace. The arm-neutral public task root contains only `task.md`, frozen public inputs, and common public scripts. It contains no `environment/skills`, `SKILL.md`, `oracle`, or `verifier` path. `S-main` alone receives a separately projected frozen Skill packet. `W-control` and `W-main` receive only the self-contained Workflow Pack; the Pack contains Workflow-native contracts and methods, not copied Skill files or source pointers. `N-main` receives neither packet. Session logs are audited after every run; a read or prompt reference to another arm's forbidden packet invalidates that run rather than being treated as a task failure.

Before any arm is launched, each converted task must pass the Skill-to-Workflow quality gate: every material source requirement is mapped, the compiler reports `fully_compiled`, every deterministic operation binds an exact pre-authorized host contract, the host preflight produces a real receipt and required artifact, and the Skill/Workflow arms use the same algorithm and resources. Method fidelity is exact rather than topical: implementation identity/API, constructor arguments, derived variables, scaling/units, rounding, and normalization rules must survive conversion. A deterministic source-to-Workflow contract check plus a public-input differential receipt is required before a converted task is experiment-eligible. `agent_assisted` or `unsupported` conversions are excluded until corrected; they cannot be relabeled as Workflow evidence.

N-main, S-main, and W-main are each repeated three times per task. W-control runs once per task because it is only a descriptive control-plane-overhead comparison against W-main: 4 tasks × (3 + 3 + 3 + 1) = 40 runs. The retained runs preserve the preregistered within-task randomized order after filtering W-control repeats 2 and 3; tasks themselves are not randomly selected. Failed and timed-out runs stay in the denominator.

## Metrics and pass rule

Per run record:

- `Success`: all frozen verifier requirements pass (0/1).
- `Q`: equal-weight fraction of the task's predeclared behavior groups passed.
- `T_online`: every model input and output token across main calls, routing, retries, and compression. Cached and visual usage are included once; unavailable usage is `unknown`, never zero.
- `C_online`, `L_final`, host receipts, model/session identity, and output hashes.

Primary comparison is paired `W-main` versus `S-main`. For each of the four tasks, Workflow is a positive case only when all three conditions hold:

1. `Success(W-main) >= Success(S-main)` over the three fixed repeats.
2. `Q(W-main) - Q(S-main) >= -0.02`.
3. `mean T_online(W-main) / mean T_online(S-main) <= 0.85`.

The four-case demonstration passes only if all four tasks are positive cases. Aggregate means cannot hide a failed task. The original Plan 1 G1/G2 confidence-bound gates remain stricter publication gates and cannot pass from this pilot alone.

## Trigger regression

`trigger_suite.json` contains four direct task requests that should select their matching Workflow, four meta/simple requests that must not start a Run, and one missing-input request that must return `need_input`. Acceptance requires zero false positives, all direct matches selected, correct missing-input behavior, and no extra model router call.

## Launch barrier

Native feasibility is complete. Conversion-quality qualification is not yet run. The comparison launcher remains fail-closed until the four task-specific Workflow graphs report `fully_compiled`, equal-capability wrappers and real host-operation preflights are frozen, formal tool/session receipts are produced, model/config and conservative budget are recorded, and the user approves this exact protocol. Approval changes the review status only; it does not itself start the 40 comparison runs.
