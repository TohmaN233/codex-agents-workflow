# No Skill / Skill / Workflow 实验报告

## Skill 来源

四个简单任务及其原始 Skill 资源来自 [SkillsBench](https://github.com/benchflow-ai/skillsbench)。以下链接指向实验使用的固定版本；部分任务使用多个 Skill，按实际组合列出。

| 任务 | 使用的 Skill | 原始参考 |
| --- | --- | --- |
| Wyckoff 晶位分析 | `pymatgen`、`sympy` | [晶位分析 Skill 目录](https://github.com/benchflow-ai/skillsbench/tree/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/crystallographic-wyckoff-position-analysis/environment/skills) |
| 地震板块计算 | `geospatial-analysis` | [地理空间分析 SKILL.md](https://github.com/benchflow-ai/skillsbench/blob/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/earthquake-plate-calculation/environment/skills/geospatial-analysis/SKILL.md) |
| 湖泊升温归因 | `trend-analysis`、`pca-decomposition`、`contribution-analysis`、`meteorology-driver-classification` | [湖泊升温归因 Skill 目录](https://github.com/benchflow-ai/skillsbench/tree/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/lake-warming-attribution/environment/skills) |
| 视频静音移除 | `audio-extractor`、`energy-calculator`、`silence-detector`、`pause-detector`、`segment-combiner`、`video-processor`、`report-generator` | [视频静音移除 Skill 目录](https://github.com/benchflow-ai/skillsbench/tree/b63b7b2850226b6aa4fb5929a8c1ac7bc4d9a6af/tasks/video-silence-remover/environment/skills) |

## 组别定义

| 缩写 | 完整名称 | 实验条件 |
| --- | --- | --- |
| `N-main` | No-Skill main-agent baseline | 主 Agent 直接完成任务；获得相同的任务、输入、公共工具和薄封装，但不获得 Skill 内容或 Workflow 图。 |
| `S-main` | Skill main-agent baseline | 同一类主 Agent 在相同任务条件下，额外获得冻结的原始 Skill 资源。 |
| `W-main` | Workflow main treatment | 转换后的 Workflow 条件；按需提供声明的流程资源，语义判断使用相同的 Main 模型。 |

后文的 `N`、`S`、`W` 分别是上述三组的简称；`main` 表示主 Agent 实验组。

## 实验范围

报告比较五个案例。四个简单任务直接比较 `N-main`（不用 Skill）、`S-main`（使用 Skill）和 `W-main`（Workflow），每组计入 3 个有效结果；Zenonzard 比较完整 31 卡 Workflow Run 与 Skill 实现。

四个简单任务统一使用 `gpt-5.6-terra` / `medium`。Token 为在线模型总 token，包含缓存输入；结果由隔离隐藏测试判定。Zenonzard 的结果采用逐卡严格语意审查：一张卡只要存在语意、注册或生命周期 bug 即判失败，不给部分分。

成本按选定有效结果归集，排除旧版本代码缺陷造成的无效试验，不表示开发和全部调试尝试的总成本。

## 四个简单任务

### Token

| 任务 | N-main | S-main | W-main | W 对 S | W 对 N |
| --- | ---: | ---: | ---: | ---: | ---: |
| Wyckoff 晶位分析 | 344,663 | 451,650 | 216,391 | −52.1% | −37.2% |
| 地震板块计算 | 412,658 | 405,055 | 193,017 | −52.3% | −53.2% |
| 湖泊升温归因 | 599,826 | 538,002 | 333,052 | −38.1% | −44.5% |
| 视频静音移除 | 938,783 | 716,519 | 407,378 | −43.1% | −56.6% |

### 隐藏测试结果

每格为“平均得分 / 严格通过次数”。

| 任务 | N-main | S-main | W-main |
| --- | ---: | ---: | ---: |
| Wyckoff 晶位分析 | 48.33% / 0/3 | 100.00% / 3/3 | 100.00% / 3/3 |
| 地震板块计算 | 58.33% / 0/3 | 100.00% / 3/3 | 100.00% / 3/3 |
| 湖泊升温归因 | 0.00% / 0/3 | 100.00% / 3/3 | 100.00% / 3/3 |
| 视频静音移除 | 44.44% / 0/3 | 88.89% / 0/3 | 88.89% / 0/3 |

### 汇总

| 指标 | N-main | S-main | W-main |
| --- | ---: | ---: | ---: |
| 每次运行平均 Token | 573,982 | 527,807 | 287,459 |
| 平均隐藏测试得分 | 37.78% | 97.22% | 97.22% |
| 严格通过 | 0/12 | 9/12 | 9/12 |

W-main 相比 S-main 少 **45.5%** token，平均得分和严格通过数相同。W-main 相比 N-main 少 **49.9%** token，平均得分高 **59.44 个百分点**，严格通过多 9 次。S-main 相比 N-main 少 **8.04%** token，平均得分高 **59.44 个百分点**，严格通过多 9 次。

四个任务中，W-main token 均低于 N-main 和 S-main。W-main 与 S-main 的四项质量结果相同；地震 Workflow 为 8/8，严格通过。视频两者均为 8/9，未严格通过。

## Zenonzard 31 卡

本实验使用作者自行开发、用于复活 ZENONZARD 的 [ZZ-Project](https://github.com/TohmaN233/ZZ-Project) 项目所用的写卡 Skill，并比较其 Skill 执行与转换后 Workflow 的 31 卡实现。

### 有效结果 Token 与 API 等价成本

| 实现 | 模型 | 未缓存输入 | 缓存输入 | 输出 | 总 Token | API 等价成本 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Skill | gpt-6-sol | 261,203 | 27,776,768 | 84,622 | **28,122,593** | **$6.9240** |
| Workflow | gpt-6-sol | 259,640 | 9,745,664 | 33,421 | **10,038,725** | **$2.8026** |
| Workflow | gpt-6-luna | 1,490,380 | 21,927,936 | 443,955 | **23,862,271** | **$0.5903** |
| **Workflow 合计** | — | **1,750,020** | **31,673,600** | **477,376** | **33,900,996** | **$3.3929** |

Workflow 总计 **33,900,996 tokens**，Skill 总计 **28,122,593 tokens**。Workflow 多用 **5,778,403 tokens（+20.55%）**；API 等价成本为 **$3.3929**，比 Skill 的 **$6.9240** 低 **51.00%**。

### 严格语意通过率

| 实现 | 通过卡数 | 通过率 | 未通过卡数 |
| --- | ---: | ---: | ---: |
| Workflow Run | **28/31** | **90.32%** | 3 |
| Skill | **20/31** | **64.52%** | 11 |

Zenonzard Workflow 的严格通过率高 25.80 个百分点，token 多 20.55%，API 等价成本低 51.00%。

## 总结

| 类型 | Token 结果 | 质量结果 |
| --- | --- | --- |
| 四个简单任务 | Workflow 相比 Skill −45.5%，相比 No Skill −49.9% | Workflow 与 Skill 均为 97.22%，严格通过均为 9/12；地震为 8/8 |
| Zenonzard 31 卡 | Workflow +20.55%；API 等价成本 −51.00% | 严格通过率 90.32% 对 64.52% |

四个简单任务中，Workflow token 同时低于 No Skill 与 Skill，质量结果与 Skill 相同。Zenonzard 中，Workflow 的 token 高于 Skill，但严格语意通过率更高、API 等价成本更低。
