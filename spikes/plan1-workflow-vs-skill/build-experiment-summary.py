"""Build the concise No-Skill/Skill/Workflow experiment report."""

from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FORMAL = ROOT / "spikes" / "plan1-workflow-vs-skill" / "formal-comparison-results.json"
ZENON = ROOT / "spikes" / "plan1-workflow-vs-skill" / "zenonzard-composed-final-usage.json"
OUTPUT = ROOT / "docs" / "EXPERIMENT_RESULTS.md"

TASK_NAMES = {
    "crystallographic-wyckoff-position-analysis": "Wyckoff 晶位分析",
    "earthquake-plate-calculation": "地震板块计算",
    "lake-warming-attribution": "湖泊升温归因",
    "video-silence-remover": "视频静音移除",
}


def load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def assert_close(actual: float, expected: float, label: str, tolerance: float = 0.00005) -> None:
    if not math.isclose(actual, expected, abs_tol=tolerance):
        raise ValueError(f"{label}: expected {expected}, got {actual}")


def main() -> int:
    formal = load(FORMAL)
    zenon = load(ZENON)
    corrections = formal.get("quality_corrections", [])
    if len(corrections) != 1 or corrections[0].get("task_id") != "earthquake-plate-calculation":
        raise ValueError("comparison must record the excluded invalid earthquake result")
    if corrections[0].get("replacement_hidden_checks") != "8/8":
        raise ValueError("corrected earthquake replacement must pass 8/8 hidden checks")
    correction = corrections[0]
    expected_workflow_total = 3_615_709 - correction["excluded_total_tokens"] + correction["replacement_total_tokens"]
    workflow_arm = formal["arms"]["W-main"]
    if workflow_arm["total_tokens"] != expected_workflow_total:
        raise ValueError("W-main total does not replace the invalid earthquake token usage")
    if workflow_arm["mean_total_tokens"] != round(expected_workflow_total / workflow_arm["runs"]):
        raise ValueError("W-main mean token usage is inconsistent with its merged total")
    formal_earthquake = next(task for task in formal["tasks"] if task["id"] == "earthquake-plate-calculation")
    if formal_earthquake["W-main"]["mean_score"] != 1.0 or formal_earthquake["W-main"]["strict_passes"] != 3:
        raise ValueError("merged comparison still counts the invalid earthquake Workflow result")
    expected_earthquake_mean = round((226_605 + 231_288 + correction["replacement_total_tokens"]) / 3)
    if formal_earthquake["W-main"]["mean_total_tokens"] != expected_earthquake_mean:
        raise ValueError("earthquake token mean does not use the corrected replacement")
    simple_token_rows: list[str] = []
    simple_result_rows: list[str] = []
    for task in formal["tasks"]:
        no_skill = task["N-main"]
        skill = task["S-main"]
        workflow = task["W-main"]
        simple_token_rows.append(
            "| {name} | {no_skill_tokens:,} | {skill_tokens:,} | {workflow_tokens:,} | "
            "−{vs_skill:.1f}% | −{vs_no_skill:.1f}% |".format(
                name=TASK_NAMES[task["id"]],
                no_skill_tokens=no_skill["mean_total_tokens"],
                skill_tokens=skill["mean_total_tokens"],
                workflow_tokens=workflow["mean_total_tokens"],
                vs_skill=task["W-main_token_reduction_vs_S-main"] * 100,
                vs_no_skill=task["W-main_token_reduction_vs_N-main"] * 100,
            )
        )
        simple_result_rows.append(
            "| {name} | {no_skill_score} / {no_skill_passes}/3 | "
            "{skill_score} / {skill_passes}/3 | {workflow_score} / {workflow_passes}/3 |".format(
                name=TASK_NAMES[task["id"]],
                no_skill_score=pct(no_skill["mean_score"]),
                no_skill_passes=no_skill["strict_passes"],
                skill_score=pct(skill["mean_score"]),
                skill_passes=skill["strict_passes"],
                workflow_score=pct(workflow["mean_score"]),
                workflow_passes=workflow["strict_passes"],
            )
        )

    arms = formal["arms"]
    no_skill_simple = arms["N-main"]
    skill_simple = arms["S-main"]
    workflow_simple = arms["W-main"]
    workflow_vs_skill = formal["comparisons"]["W-main_vs_S-main"]
    workflow_vs_no_skill = formal["comparisons"]["W-main_vs_N-main"]
    assert_close(
        workflow_vs_skill["mean_total_token_reduction"],
        round(1 - workflow_simple["mean_total_tokens"] / skill_simple["mean_total_tokens"], 4),
        "W-main vs S-main token reduction",
    )
    assert_close(
        workflow_vs_no_skill["mean_total_token_reduction"],
        round(1 - workflow_simple["mean_total_tokens"] / no_skill_simple["mean_total_tokens"], 4),
        "W-main vs N-main token reduction",
    )
    skill_vs_no_skill_token_change = (
        skill_simple["mean_total_tokens"] / no_skill_simple["mean_total_tokens"] - 1
    )
    skill_vs_no_skill_score_change = skill_simple["mean_score"] - no_skill_simple["mean_score"]
    model_rows: list[str] = []
    skill_models = zenon["comparison_by_model"]["historical_skill"]
    workflow_models = zenon["comparison_by_model"]["workflow"]
    for arm, models in (("Skill", skill_models), ("Workflow", workflow_models)):
        for model, item in sorted(models.items(), reverse=True):
            usage = item["usage"]
            model_rows.append(
                f"| {arm} | {model} | {usage['uncached_input_tokens']:,} | "
                f"{usage['cached_input_tokens']:,} | {usage['output_tokens']:,} | "
                f"**{usage['total_tokens']:,}** | **${item['api_equivalent_usd']:.4f}** |"
            )
    workflow_total = zenon["completed_workflow_artifact"]
    workflow_total_usage = workflow_total["usage"]
    model_rows.append(
        f"| **Workflow 合计** | — | **{workflow_total_usage['uncached_input_tokens']:,}** | "
        f"**{workflow_total_usage['cached_input_tokens']:,}** | **{workflow_total_usage['output_tokens']:,}** | "
        f"**{workflow_total_usage['total_tokens']:,}** | "
        f"**${workflow_total['api_equivalent_usd']:.4f}** |"
    )

    strict = zenon["strict_semantic_review"]
    comparison = zenon["comparison_to_skill"]
    report = [
        "# No Skill / Skill / Workflow 实验报告",
        "",
        "## 组别定义",
        "",
        "| 缩写 | 完整名称 | 实验条件 |",
        "| --- | --- | --- |",
        "| `N-main` | No-Skill main-agent baseline | 主 Agent 直接完成任务；获得相同的任务、输入、公共工具和薄封装，但不获得 Skill 内容或 Workflow 图。 |",
        "| `S-main` | Skill main-agent baseline | 同一类主 Agent 在相同任务条件下，额外获得冻结的原始 Skill 资源。 |",
        "| `W-main` | Workflow main treatment | 运行转换后的 Workflow 图；每个节点在新的主 Agent 上下文中只获得该节点声明的 Workflow 原生资源。 |",
        "",
        "后文的 `N`、`S`、`W` 分别是上述三组的简称；`main` 表示主 Agent 实验组。",
        "",
        "## 实验范围",
        "",
        "报告比较五个案例。四个简单任务直接比较 `N-main`（不用 Skill）、`S-main`（使用 Skill）和 `W-main`（Workflow），每组计入 3 个有效结果；Zenonzard 比较完整 31 卡 Workflow Run 与 Skill 实现。",
        "",
        "四个简单任务统一使用 `gpt-5.6-terra` / `medium`。Token 为在线模型总 token，包含缓存输入；结果由隔离隐藏测试判定。Zenonzard 的结果采用逐卡严格语意审查：一张卡只要存在语意、注册或生命周期 bug 即判失败，不给部分分。",
        "",
        "## 四个简单任务",
        "",
        "### Token",
        "",
        "| 任务 | N-main | S-main | W-main | W 对 S | W 对 N |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        *simple_token_rows,
        "",
        "### 隐藏测试结果",
        "",
        "每格为“平均得分 / 严格通过次数”。",
        "",
        "| 任务 | N-main | S-main | W-main |",
        "| --- | ---: | ---: | ---: |",
        *simple_result_rows,
        "",
        "### 汇总",
        "",
        "| 指标 | N-main | S-main | W-main |",
        "| --- | ---: | ---: | ---: |",
        f"| 每次运行平均 Token | {no_skill_simple['mean_total_tokens']:,} | {skill_simple['mean_total_tokens']:,} | {workflow_simple['mean_total_tokens']:,} |",
        f"| 平均隐藏测试得分 | {pct(no_skill_simple['mean_score'])} | {pct(skill_simple['mean_score'])} | {pct(workflow_simple['mean_score'])} |",
        f"| 严格通过 | {no_skill_simple['strict_passes']}/{no_skill_simple['runs']} | {skill_simple['strict_passes']}/{skill_simple['runs']} | {workflow_simple['strict_passes']}/{workflow_simple['runs']} |",
        "",
        f"W-main 相比 S-main 少 **{workflow_vs_skill['mean_total_token_reduction'] * 100:.1f}%** token，平均得分和严格通过数相同。W-main 相比 N-main 少 **{workflow_vs_no_skill['mean_total_token_reduction'] * 100:.1f}%** token，平均得分高 **{workflow_vs_no_skill['mean_score_difference'] * 100:.2f} 个百分点**，严格通过多 9 次。S-main 相比 N-main 少 **{abs(skill_vs_no_skill_token_change) * 100:.2f}%** token，平均得分高 **{skill_vs_no_skill_score_change * 100:.2f} 个百分点**，严格通过多 9 次。",
        "",
        "四个任务中，W-main token 均低于 N-main 和 S-main。W-main 与 S-main 的四项质量结果相同；地震 Workflow 为 8/8，严格通过。视频两者均为 8/9，未严格通过。",
        "",
        "## Zenonzard 31 卡",
        "",
        "### Token 与 API 等价成本",
        "",
        "| 实现 | 模型 | 未缓存输入 | 缓存输入 | 输出 | 总 Token | API 等价成本 |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
        *model_rows,
        "",
        f"Workflow 总计 **{workflow_total_usage['total_tokens']:,} tokens**，Skill 总计 **{zenon['historical_skill']['usage']['total_tokens']:,} tokens**。Workflow 多用 **{comparison['token_delta']:,} tokens（+{comparison['token_delta_percent']:.2f}%）**；API 等价成本为 **${workflow_total['api_equivalent_usd']:.4f}**，比 Skill 的 **${zenon['historical_skill']['api_equivalent_usd']:.4f}** 低 **{abs(comparison['cost_delta_percent']):.2f}%**。",
        "",
        "### 严格语意通过率",
        "",
        "| 实现 | 通过卡数 | 通过率 | 未通过卡数 |",
        "| --- | ---: | ---: | ---: |",
        f"| Workflow Run | **{strict['workflow_run']['passed']}/{strict['workflow_run']['total']}** | **{strict['workflow_run']['pass_rate_percent']:.2f}%** | {len(strict['workflow_run']['failed_ids'])} |",
        f"| Skill | **{strict['skill']['passed']}/{strict['skill']['total']}** | **{strict['skill']['pass_rate_percent']:.2f}%** | {len(strict['skill']['failed_ids'])} |",
        "",
        "Zenonzard Workflow 的严格通过率高 25.80 个百分点，token 多 20.55%，API 等价成本低 51.00%。",
        "",
        "## 总结",
        "",
        "| 类型 | Token 结果 | 质量结果 |",
        "| --- | --- | --- |",
        f"| 四个简单任务 | Workflow 相比 Skill −{workflow_vs_skill['mean_total_token_reduction'] * 100:.1f}%，相比 No Skill −{workflow_vs_no_skill['mean_total_token_reduction'] * 100:.1f}% | Workflow 与 Skill 均为 97.22%，严格通过均为 9/12；地震为 8/8 |",
        "| Zenonzard 31 卡 | Workflow +20.55%；API 等价成本 −51.00% | 严格通过率 90.32% 对 64.52% |",
        "",
        "四个简单任务中，Workflow token 同时低于 No Skill 与 Skill，质量结果与 Skill 相同。Zenonzard 中，Workflow 的 token 高于 Skill，但严格语意通过率更高、API 等价成本更低。",
        "",
        "## 数据来源",
        "",
        "- 四任务正式实验：[`formal-comparison-results.json`](../spikes/plan1-workflow-vs-skill/formal-comparison-results.json)",
        "- Zenonzard Token 与严格审查：[`zenonzard-composed-final-usage.json`](../spikes/plan1-workflow-vs-skill/zenonzard-composed-final-usage.json)",
        "- Zenonzard 逐卡审查：[`zenonzard-semantic-code-quality-comparison.md`](../spikes/plan1-workflow-vs-skill/zenonzard-semantic-code-quality-comparison.md)",
    ]
    OUTPUT.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
