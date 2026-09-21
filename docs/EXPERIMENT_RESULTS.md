# Skill → Workflow comparison

The v1.0 host-driven design was evaluated on four implementation-qualified tasks: crystallographic Wyckoff analysis, earthquake plate calculation, lake-warming attribution, and video silence removal. Each of the three primary arms ran three times per task; the full-context Workflow control ran once per task, for 40 judged runs in total.

All semantic work in this comparison used `gpt-5.6-terra` at `medium`. Runs used fresh tasks and workspaces. The no-guidance arm saw only the public task, the Skill arm saw the frozen Skill packet, and Workflow arms saw self-contained Workflow-native resources without access to the source Skill. Hidden judges and contamination audits were outside the candidate context.

| Arm | Runs | Mean hidden-test score | Strict passes | Mean total tokens |
| --- | ---: | ---: | ---: | ---: |
| No guidance (`N-main`) | 12 | 0.3778 | 0/12 | 573,982 |
| Frozen Skill (`S-main`) | 12 | 0.9722 | 9/12 | 527,807 |
| Node-scoped Workflow (`W-main`) | 12 | 0.9618 | 8/12 | 301,309 |
| Full-context Workflow (`W-control`) | 4 | 0.9722 | 3/4 | 419,006 |

Compared with the frozen Skill arm, the node-scoped Workflow arm reduced mean total tokens by **42.9%** while its mean hidden-test score differed by **−0.0104**. Token reductions appeared on every task: **52.1%**, **38.7%**, **38.1%**, and **43.1%** respectively. Compared with preloading the full Workflow, node-scoped projection reduced mean tokens by **28.1%**.

The result supports two concrete design choices: Workflow control fields belong to the Host, and semantic nodes should receive only their declared resources. It does not establish that every Skill benefits from conversion, and the Workflow arm did not exactly match the Skill arm on every strict pass. The claim is limited to these four heterogeneous, prequalified tasks.

The frozen protocol and machine-readable aggregate are in [`spikes/plan1-workflow-vs-skill/EXPERIMENT_PROTOCOL.md`](../spikes/plan1-workflow-vs-skill/EXPERIMENT_PROTOCOL.md) and [`formal-comparison-results.json`](../spikes/plan1-workflow-vs-skill/formal-comparison-results.json).
