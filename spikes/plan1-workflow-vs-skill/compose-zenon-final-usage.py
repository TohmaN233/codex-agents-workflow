"""Compose the final Zenonzard ledger from deterministic Run-owned reports."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


USAGE_KEYS = (
    "input_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "total_tokens",
    "uncached_input_tokens",
)

HISTORICAL_SKILL = {
    "model": "gpt-6-sol",
    "usage": {
        "input_tokens": 28_037_971,
        "cached_input_tokens": 27_776_768,
        "cache_write_input_tokens": 0,
        "output_tokens": 84_622,
        "total_tokens": 28_122_593,
        "uncached_input_tokens": 261_203,
    },
    "api_equivalent_usd": 6.9239796,
    "caveat": "Two-turn continuation; the second turn inherited eight first-turn drafts.",
}


def load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def sum_usage(*items: dict[str, int]) -> dict[str, int]:
    return {key: sum(int(item[key]) for item in items) for key in USAGE_KEYS}


def model_breakdown(*reports: dict[str, object]) -> dict[str, dict[str, object]]:
    grouped: dict[str, dict[str, object]] = {}
    for report in reports:
        for item in (report["controller"], *report["native_sessions"]):
            models = item["models"]
            if len(models) != 1:
                raise RuntimeError(f"session {item['thread_id']} has ambiguous models: {models}")
            model = models[0]
            group = grouped.setdefault(
                model,
                {
                    "usage": {key: 0 for key in USAGE_KEYS},
                    "api_equivalent_usd": 0.0,
                    "sessions": 0,
                },
            )
            group["usage"] = sum_usage(group["usage"], item["usage"])
            group["api_equivalent_usd"] += float(item["api_equivalent_usd"])
            group["sessions"] += 1
    for group in grouped.values():
        group["api_equivalent_usd"] = round(group["api_equivalent_usd"], 8)
    return dict(sorted(grouped.items()))


def strict_semantic_review(path: Path) -> dict[str, object]:
    rows: list[tuple[str, str, str]] = []
    workflow_run_defects: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) == 4 and re.fullmatch(r"(?:red|yellow|purple|green|blue|white|colorless)_[0-9a-z_]+", cells[0]):
            rows.append((cells[0], cells[1], cells[2]))
        elif (
            len(cells) == 3
            and re.fullmatch(r"(?:red|yellow|purple|green|blue|white|colorless)_[0-9a-z_]+", cells[0])
            and cells[1].startswith(("Partial", "Material gap"))
        ):
            workflow_run_defects.add(cells[0])
    if len(rows) != 31:
        raise RuntimeError(f"expected 31 semantic audit rows, got {len(rows)}")
    result: dict[str, object] = {
        "rule": "A card passes only when direct strict semantic review found no bug; Partial and Material gap both fail.",
        "total_cards": len(rows),
    }
    for label, column in (("post_audit_checkout", 1), ("skill", 2)):
        passed = sorted(card_id for card_id, *statuses in rows if statuses[column - 1] == "OK")
        failed = sorted(card_id for card_id, *statuses in rows if statuses[column - 1] != "OK")
        result[label] = {
            "passed": len(passed),
            "total": len(rows),
            "pass_rate_percent": round(len(passed) / len(rows) * 100, 2),
            "passed_ids": passed,
            "failed_ids": failed,
        }
    corrected_passed = set(result["post_audit_checkout"]["passed_ids"])
    workflow_run_passed = sorted(corrected_passed - workflow_run_defects)
    result["workflow_run"] = {
        "passed": len(workflow_run_passed),
        "total": len(rows),
        "pass_rate_percent": round(len(workflow_run_passed) / len(rows) * 100, 2),
        "passed_ids": workflow_run_passed,
        "failed_ids": sorted(workflow_run_defects),
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preserved", type=Path, required=True)
    parser.add_argument("--repair", type=Path, required=True)
    parser.add_argument("--source-full", type=Path, required=True)
    parser.add_argument("--semantic-audit", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    preserved = load(args.preserved)
    repair = load(args.repair)
    source_full = load(args.source_full)
    preserved_total = preserved["all_online_totals"]
    repair_total = repair["all_online_totals"]
    composed_usage = sum_usage(preserved_total["usage"], repair_total["usage"])
    composed_cost = round(
        float(preserved_total["api_equivalent_usd"])
        + float(repair_total["api_equivalent_usd"]),
        8,
    )
    skill_usage = HISTORICAL_SKILL["usage"]
    skill_cost = HISTORICAL_SKILL["api_equivalent_usd"]
    token_delta = composed_usage["total_tokens"] - skill_usage["total_tokens"]
    cost_delta = round(composed_cost - skill_cost, 8)
    discarded = source_full["nodes"]["activity_005r"]
    workflow_models = model_breakdown(preserved, repair)

    report = {
        "schema": "zenonzard-composed-final-usage/v2",
        "measurement_boundary": (
            "Only the two Run journals' own native_parent_thread_id sessions, clipped to their "
            "Run/node timestamps, plus the native sessions mapped by those journals. The long-lived "
            "workflow development chat is excluded."
        ),
        "pricing": preserved["pricing"],
        "comparison_by_model": {
            "workflow": workflow_models,
            "historical_skill": {
                HISTORICAL_SKILL["model"]: {
                    "usage": skill_usage,
                    "api_equivalent_usd": skill_cost,
                    "sessions": 1,
                    "caveat": HISTORICAL_SKILL["caveat"],
                }
            },
        },
        "strict_semantic_review": strict_semantic_review(args.semantic_audit),
        "preserved_pre_repair": {
            "run_id": preserved["run_id"],
            "source_report": args.preserved.name,
            "selected_nodes": preserved["selected_nodes"],
            "controller_scope": preserved["controller_scope"],
            "controller": preserved["controller"],
            "native_totals": preserved["native_totals"],
            "all_online_totals": preserved_total,
        },
        "successful_repair_continuation": {
            "run_id": repair["run_id"],
            "source_report": args.repair.name,
            "controller_scope": repair["controller_scope"],
            "controller": repair["controller"],
            "native_totals": repair["native_totals"],
            "all_online_totals": repair_total,
        },
        "discarded_failed_repair": {
            "run_id": source_full["run_id"],
            "node_id": "activity_005r",
            "usage": discarded["usage"],
            "api_equivalent_usd": discarded["api_equivalent_usd"],
            "included_in_final_total": False,
        },
        "completed_workflow_artifact": {
            "usage": composed_usage,
            "api_equivalent_usd": composed_cost,
        },
        "historical_skill": {
            "model": HISTORICAL_SKILL["model"],
            "usage": skill_usage,
            "api_equivalent_usd": skill_cost,
            "caveat": HISTORICAL_SKILL["caveat"],
        },
        "comparison_to_skill": {
            "token_delta": token_delta,
            "token_delta_percent": round(token_delta / skill_usage["total_tokens"] * 100, 2),
            "cost_delta_usd": cost_delta,
            "cost_delta_percent": round(cost_delta / skill_cost * 100, 2),
        },
        "run_owned_native_only_diagnostic": {
            "usage": sum_usage(
                preserved["native_totals"]["usage"],
                repair["native_totals"]["usage"],
            ),
            "note": "Excludes both correctly identified Run controller sessions.",
        },
    }
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
