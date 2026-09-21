# Skill-to-Workflow conversion design (revision 4)

## Goal

Convert a Skill into an executable Workflow without claiming that prompt decomposition is compilation. The converter must preserve source behavior, expose unsupported behavior, and move deterministic operations to exact host contracts only when the host has independently authorized those contracts.

## Pipeline

1. Freeze the complete Skill source pack and hashes.
2. Record dependency observations separately from unconditional requirements and tool policy.
3. Extract a typed source-requirement inventory before generating a graph. The deterministic floor scans instruction/spec resources for approvals, mid-run user input, explicit artifact paths and interfaces, prescribed methods, dependency phase/trigger, and inline local-script calls. Method requirements include exact library/API identity, constructor arguments, derived-variable formulas, scaling/units, rounding, and explicit normalization or non-normalization rules found in normative Markdown, including its code blocks. Implementation code and data files are not treated as normative prose. The planning model may add requirements but cannot remove the floor.
4. Generate contract-first: propose nodes, explicit JSON-pointer input bindings, bounded nested output schemas, minimal node-scoped resource references, requirement IDs, and requirement mappings in one structured result. The generator receives the deterministic inventory before choosing the graph.
5. Bind deterministic operations only to exact host-tool contracts supplied by trusted configuration. The model cannot create a contract, authorize a script, or turn arbitrary shell text into an executable node.
6. Before spending a reviewer turn, deterministically validate graph structure, binding provenance, resource membership, approval ordering, artifact producers, method references, dependency classification, operation contracts, and requirement coverage. An incomplete or `unsupported` v4 proposal returns to the bounded generator repair loop.
7. Run an independent semantic review with the exact proposal explicitly projected into its isolated context. Its checklist covers artifact/interface contracts, method fidelity, dependency binding, validation strength, and cross-resource consistency. Model approval cannot override deterministic findings.
8. At the final mutation boundary, repeat the pinned-version review and v4 compiler checks before saving a Draft with a compiler-derived conversion level. Persisted v2/v3 jobs continue to use their own pinned checklist shapes.
9. At runtime, host operations use `intent -> execution -> durable receipt -> commit`; an unknown result requires reconciliation before retry.

## Conversion levels

- `fully_compiled`: every declared and deterministically observed material requirement has a verified runtime mapping; executable nodes use explicit input/resource projection; deterministic operations have exact host contracts.
- `agent_assisted`: behavior is preserved but at least one step still depends on an Agent interpreting the pinned Skill or references.
- `unsupported`: a required behavior has no faithful current runtime representation, such as structured mid-Run user input without an input node.

The compiler computes the level. A generation model or reviewer cannot self-declare it.

## Dependency semantics

- `observed_dependencies`: static evidence that a resource mentions an executable or environment variable. Observation does not make it globally required.
- `required_dependencies`: explicitly declared or source-mapped unconditional requirements.
- `conditional_dependencies`: remain attached to their triggering operation.
- `tool_policy`: allowed/pre-approved tools; it is not a list of tools that must all exist.
- A dependency required to run the produced artifact is not automatically required to author that artifact. Implementation nodes must distinguish `authoring_required` dependencies from `runtime_validation_only` dependencies. A missing `runtime_validation_only` dependency lowers the validation level and stays observable in the candidate manifest; it must not turn a successfully written implementation into a blocked node.
- A node may block for a missing dependency only when the node's declared output cannot be produced without executing that dependency. The node contract must name this condition explicitly rather than using a blanket "input or dependency unavailable" rule.

## Host operation boundary

A tool node is executable only when its ID resolves to a pinned contract containing exact identity, structured input/output schemas, permissions, deadline, output cap, and idempotency mode. The registered broker must independently attest cancellation and effect observation. A source script without such a contract remains `agent_assisted` or `unsupported`.

This design intentionally does not treat `shell=false` as a sandbox. Arbitrary imported code needs an independently qualified isolation broker. Plan 1 may use task-specific trusted wrappers on Windows or WSL, but both Skill and Workflow arms must receive the same algorithm and resources.

## Current limits

- General structured mid-Run user input is not implemented; required cases are `unsupported` rather than folded into an approval gate.
- Deterministic source-requirement extraction is a conservative floor over normative text, not a complete natural-language proof; independent review remains required as an insurance gate, not as the primary conversion mechanism.
- Automatic registration of arbitrary imported scripts is intentionally absent.

## Experiment eligibility

Each of the four Plan 1 tasks must independently show:

1. compiler level `fully_compiled`;
2. complete requirement coverage;
3. a real host preflight receipt and required artifact;
4. identical algorithm/resources across Skill and Workflow arms, demonstrated before eligibility by a source-to-Workflow method-contract check and a public-input differential receipt for deterministic calculations;
5. no hidden verifier/oracle material in the Workflow.

Until all four pass, the formal 40-run comparison remains `NOT_RUN` (three repeats for N-main, S-main and W-main; one W-control run per task).
