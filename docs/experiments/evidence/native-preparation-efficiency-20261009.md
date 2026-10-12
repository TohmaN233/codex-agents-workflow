# Native preparation and publication efficiency — 2026-10-09

The frozen three-page Skill reference remains unchanged. Run `7616f605-bc83-4d50-bae2-fba30bf238b9` delivered all pages and passed paired quality review, but failed cost and input gates: USD 0.3918956 versus 0.193252, 735338 versus 434835 input tokens. Complete wall time was 154679 versus 158577 ms. This correction is source qualification, not a passing business result or an installed fix.

## Evidence and boundaries

Task-owned records live under `G:/Baiduyun/CAW-HTML-Experiments/staging/native-preparation-efficiency-20261009/`. Before-images, original failing checks and corrected checks are retained. External response attribution lives in `runs/r15-current/workflow/protocol/response-work-profile.json`; neither baseline nor business metrics were rewritten.

The inspected r15 foreground path performed no whole-package resource audit. Read/guard/writer counters overlap and are not additive wall-time measurements. A read-only copy of the exact journal measured individual wait reads around 29–39 ms; this does not explain the entire 28-second follow-up call. Do not remove cross-process locks or attribute the full delay to them without evidence.

## Corrections

- New Run pins select executable projection version 1. Once Host preparation verifies all declared executables, worker prompts retain authoritative locations but no longer assign another discovery/version probe. Environment declarations and unresolved requirements remain visible. Missing epoch preserves historical prompt bytes and dispatch hashes; unknown epoch fails. Child pins inherit the parent's epoch.
- Native checker input publication and its exact intent use one fresh `native_prepare` transaction. A stale controller fails before publishing an input. Append failure retains its durable prefix and remains visible.
- Successful checker output and receipt publication use one transaction after workspace snapshot preparation. External checker execution, cancellation and authority callbacks remain outside. An uncertain intent cannot replay side effects after a receipt append failure.
- Raw and merged amendment artifacts use one publication transaction. A rejected amendment still commits the existing failed raw trace before surfacing its error. Repair authorization and external observation remain outside.
- Fresh target projection and its preflight event share one transaction, released before running any checker.
- Accepted item results and a successfully completed serial/parallel assignment share one transaction. Only an issue-free, fully resolved assignment advances. Aggregate append failure retains the accepted item and checker evidence, fails visibly and never becomes model repair or successful join. Existing terminal-turn recording differences are preserved.
- Combined qualification exposed an existing all-inherited retry defect: with zero runnable slots, initial and resumed dispatch could seal without initializing the completion baseline. Both empty-slot entries now call the same guarded baseline preparation as ordinary materialization, before receipt sealing and outside the publication transaction. No child, task material or fake publication is created. A possibly started child still prevents inventing a missing baseline; historical epochs retain their old behavior.

These are fewer physical writer acquisitions around already-related Host publications. They do not remove durable events, bypass pinned authority, widen write scopes or move external work under a Run lock.

A separate observed Role compiler defect converted structured ownership constraints to `[object Object]`. Builtin and stored append-context profiles now retain canonical JSON constraints; string/absent behavior and the original size failure remain. The focused public-service regression first failed on lost content and then passed for objects, arrays, booleans, zero, strings, absent values and oversized input. This proves constraint preservation, not a cause of the earlier Workflow workers' extra research: Workflow node tasks do not use this Role compiler.

## Qualification

Focused checks cover executable projection and historical continuation, physical lock acquisition counts, stale authority, durable append failures, serial/parallel/capped and incremental item joins, same-child amendment repair and acceptance of a ready sibling during another child's repair. The long task-carrier fixture explicitly consumes the actual file carrier; its direct-interface assertion explicitly selects `direct_mcp`. No runtime check was relaxed to repair those fixtures.

A read-only review found the initial unversioned prompt change would invalidate historical dispatch hashes. The Host-pinned epoch correction resolves that finding; subsequent bounded review found no confirmed regression. Full repository regression and a new paid business cohort have not been run for these changes.

The combined pre-empty-fix native run passed 19 checks and exposed the inherited retry failure; the separate dependency/transaction/resource run passed 21 checks. The corrected all-inherited integration check passes with zero observer calls and no publications. All 28 dispatch-span checks pass, including empty-baseline replay, rejection after a possibly started child, actual outside effects, original authority, cancellation, restart and late changes. Original failures remain retained. The bounded evidence collector must select TAP or recognize the actual reporter; its initial empty count map is not a runtime failure or a passing qualification.

## Remaining semantic-path difference

The frozen Skill performed zero web calls. TCP and cache workers in r15 chose five long web calls, with roughly 167 KB of serialized tool output. The assigned node and native profile did not explicitly require this added research. The original Skill prescribes short content, one renderer invocation and diagnostic-driven repair; preserving the complete operational procedure, rather than only format rules, still needs review. No exact instruction-to-research causal trigger has been established. Do not ban necessary verification, change pricing, or promise that context isolation alone reduces complete cost.
