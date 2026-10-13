# No Skill / Skill / Workflow Experimental Results

[中文报告](results.zh-CN.md) · [Experiments index](README.md) · [Current usage guide](../guides/usage.md)

This report records specific historical samples. It does not describe the current 1.2 default library, default Provider or Role state, or the effect on every task. See the [usage guide](../guides/usage.md) for current configuration.

## Skill sources

The four simple tasks and their source Skills came from [SkillsBench](https://github.com/benchflow-ai/skillsbench). These links point to the fixed revisions used in the experiment. Some tasks used multiple Skills; the table lists the combinations actually used.

| Task | Skills used | Original source |
| --- | --- | --- |
| Wyckoff position analysis | pymatgen, sympy | [Wyckoff-position Skill directory](https://github.com/benchflow-ai/skillsbench/tree/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/crystallographic-wyckoff-position-analysis/environment/skills) |
| Earthquake plate calculation | geospatial-analysis | [geospatial-analysis SKILL.md](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/earthquake-plate-calculation/environment/skills/geospatial-analysis/SKILL.md) |
| Lake warming attribution | trend-analysis, pca-decomposition, contribution-analysis, meteorology-driver-classification | [Lake warming attribution Skill directory](https://github.com/benchflow-ai/skillsbench/tree/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/lake-warming-attribution/environment/skills) |
| Video silence removal | audio-extractor, energy-calculator, silence-detector, pause-detector, segment-combiner, video-processor, report-generator | [Video silence removal Skill directory](https://github.com/benchflow-ai/skillsbench/tree/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/video-silence-remover/environment/skills) |

## Cohorts and scope

| Label | Full name | Experimental condition |
| --- | --- | --- |
| N-main | No-Skill main-agent baseline | Main completes the task with the same task, inputs, shared tools, and thin wrapper, but without Skill content or a Workflow graph. |
| S-main | Skill main-agent baseline | The same type of Main completes the task with the frozen source Skill added. |
| W-main | Workflow main treatment | The converted Workflow supplies declared process resources as needed, with semantic judgments made by the same Main model. |

Later sections use N, S, and W as shorthand for these groups; main denotes the Main-agent group.

Each of the four simple tasks has three valid results per group, or 12 runs per group. The Zenonzard comparison uses a complete 31-card Workflow Run and a Skill implementation. The simple tasks all used gpt-5.6-terra at medium reasoning effort. Token counts are total online model tokens, including cached input. Scores came from isolated hidden tests. Zenonzard used a strict card-by-card semantic review: a semantic, registration, or lifecycle bug failed that card, with no partial credit.

Costs aggregate selected valid results and exclude invalid trials caused by defects in older code; they are not the total cost of development and all debugging attempts. The 40 valid isolated results for the simple tasks include 12 primary samples in each group plus four control runs that preloaded the complete Workflow into Main. The report provides no verifiable run date, so none is added here.

## Four simple tasks

### Tokens

| Task | N-main | S-main | W-main | W vs. S | W vs. N |
| --- | ---: | ---: | ---: | ---: | ---: |
| Wyckoff position analysis | 344,663 | 451,650 | 216,391 | −52.1% | −37.2% |
| Earthquake plate calculation | 412,658 | 405,055 | 193,017 | −52.3% | −53.2% |
| Lake warming attribution | 599,826 | 538,002 | 333,052 | −38.1% | −44.5% |
| Video silence removal | 938,783 | 716,519 | 407,378 | −43.1% | −56.6% |

### Hidden-test results

Each cell gives the mean score and strict passes.

| Task | N-main | S-main | W-main |
| --- | ---: | ---: | ---: |
| Wyckoff position analysis | 48.33% / 0/3 | 100.00% / 3/3 | 100.00% / 3/3 |
| Earthquake plate calculation | 58.33% / 0/3 | 100.00% / 3/3 | 100.00% / 3/3 |
| Lake warming attribution | 0.00% / 0/3 | 100.00% / 3/3 | 100.00% / 3/3 |
| Video silence removal | 44.44% / 0/3 | 88.89% / 0/3 | 88.89% / 0/3 |

### Summary

| Metric | N-main | S-main | W-main |
| --- | ---: | ---: | ---: |
| Mean tokens per run | 573,982 | 527,807 | 287,459 |
| Mean hidden-test score | 37.78% | 97.22% | 97.22% |
| Strict passes | 0/12 | 9/12 | 9/12 |

W-main used **45.5% fewer tokens** than S-main with the same mean score and number of strict passes. Compared with N-main, W-main used **49.9% fewer tokens**, scored **59.44 percentage points higher** on average, and had nine more strict passes. S-main used **8.04% fewer tokens** than N-main, scored **59.44 percentage points higher**, and had nine more strict passes.

Across the four tasks, W-main used fewer tokens than both N-main and S-main. W-main and S-main had the same four quality results. The report records the earthquake Workflow as 8/8 with a strict pass; for video, both had 8/9 and neither passed strict evaluation.

## Zenonzard: 31 cards

This experiment used the card-writing Skill from the author's [ZZ-Project](https://github.com/TohmaN233/ZZ-Project), a project to revive ZENONZARD. It compares execution with that Skill against a 31-card implementation using the converted Workflow.

### Valid-result tokens and API-equivalent cost

| Implementation | Model | Uncached input | Cached input | Output | Total tokens | API-equivalent cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Skill | gpt-6-sol | 261,203 | 27,776,768 | 84,622 | **28,122,593** | **$6.9240** |
| Workflow | gpt-6-sol | 259,640 | 9,745,664 | 33,421 | **10,038,725** | **$2.8026** |
| Workflow | gpt-6-luna | 1,490,380 | 21,927,936 | 443,955 | **23,862,271** | **$0.5903** |
| **Workflow total** | — | **1,750,020** | **31,673,600** | **477,376** | **33,900,996** | **$3.3929** |

The Workflow used **33,900,996 tokens**, **5,778,403 more (+20.55%)** than the Skill's **28,122,593**. Its API-equivalent cost was **$3.3929**, **51.00% lower** than the Skill's **$6.9240**.

### Strict semantic pass rate

| Implementation | Cards passed | Pass rate | Cards failed |
| --- | ---: | ---: | ---: |
| Workflow Run | **28/31** | **90.32%** | 3 |
| Skill | **20/31** | **64.52%** | 11 |

The Zenonzard Workflow had a strict pass rate **25.80 percentage points higher**, used **20.55% more tokens**, and had **51.00% lower API-equivalent cost**. The Skill and Workflow used different model routing, so the difference cannot be attributed to the Workflow's context mechanism alone.

## Conclusion

For the four simple tasks, Workflow used fewer tokens than No Skill and Skill, while its mean score and strict-pass count matched Skill. In the Zenonzard sample, Workflow used more tokens but achieved a higher strict semantic pass rate and lower API-equivalent cost. These results apply only to the stated tasks, models, samples, and scoring rules.
