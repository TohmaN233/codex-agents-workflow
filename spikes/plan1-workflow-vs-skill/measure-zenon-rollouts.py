"""External Zenonzard usage ledger reconstructed from exact Codex rollouts.

This analyzer is never imported or invoked by a Workflow Run.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path


CODEX_HOME = Path.home() / ".codex"
SESSION_ROOT = CODEX_HOME / "sessions"
ARCHIVED_SESSION_ROOT = CODEX_HOME / "archived_sessions"
RATES = {
    "gpt-6-sol": {"input": 2.0, "cached": 0.20, "cache_write": 2.50, "output": 10.0},
    "gpt-6-luna": {"input": 0.10, "cached": 0.01, "cache_write": 0.125, "output": 0.50},
}


def load_run_events(run_events: Path) -> list[dict[str, object]]:
    return [
        json.loads(line)
        for line in run_events.read_text(encoding="utf-8").splitlines()
    ]


def run_thread_nodes(
        events: list[dict[str, object]],
        selected_nodes: set[str] | None = None,
) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for event in events:
        for node_id, node in event.get("payload", {}).get("patch", {}).get("nodes", {}).items():
            if selected_nodes is not None and node_id not in selected_nodes:
                continue
            for attempt in node.get("attempts", []):
                for executor_event in attempt.get("executor_events", []):
                    diagnostic = executor_event.get("metadata", {}).get("diagnostic", "")
                    match = re.search(r"resolved to thread ([0-9a-f-]{36})", diagnostic)
                    if match:
                        prior = mapping.setdefault(match.group(1), node_id)
                        if prior != node_id:
                            raise RuntimeError(f"thread {match.group(1)} maps to both {prior} and {node_id}")
    if not mapping:
        raise RuntimeError("no native Agent thread identities found in the Run journal")
    return mapping


def run_controller_scope(
        events: list[dict[str, object]],
        selected_nodes: set[str] | None,
) -> dict[str, str]:
    if not events or events[0].get("kind") != "started":
        raise RuntimeError("Run journal has no started event")
    state = events[0].get("payload", {}).get("state", {})
    thread_id = state.get("constraints", {}).get("native_parent_thread_id")
    if not isinstance(thread_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", thread_id):
        raise RuntimeError("Run journal has no valid native_parent_thread_id")
    end = events[-1]["at"]
    if selected_nodes is not None:
        completed: dict[str, str] = {}
        for event in events:
            for node_id, node in event.get("payload", {}).get("patch", {}).get("nodes", {}).items():
                if (
                    event.get("kind") == "complete"
                    and node_id in selected_nodes
                    and node.get("status") == "succeeded"
                ):
                    completed.setdefault(node_id, event["at"])
        missing = sorted(selected_nodes - completed.keys())
        if missing:
            raise RuntimeError(f"selected nodes never succeeded: {missing}")
        end = max(completed.values())
    return {
        "thread_id": thread_id,
        "start": events[0]["at"],
        "end": end,
        "source": "Run journal native_parent_thread_id and node completion events",
    }


def rollout_for(thread_id: str) -> Path:
    matches = [
        path
        for root in (SESSION_ROOT, ARCHIVED_SESSION_ROOT)
        if root.exists()
        for path in root.rglob(f"*{thread_id}*.jsonl")
    ]
    if len(matches) != 1:
        raise RuntimeError(f"expected one rollout for {thread_id}, got {len(matches)}")
    return matches[0]


def price_record(model: str, usage: dict[str, int]) -> float:
    rates = RATES[model]
    long = usage["input_tokens"] > 272_000
    uncached_rate = rates["input"] * (2 if long else 1)
    cached_rate = rates["cached"] * (2 if long else 1)
    cache_write_rate = rates["cache_write"] * (2 if long else 1)
    output_rate = rates["output"] * (1.5 if long else 1)
    uncached = usage["input_tokens"] - usage["cached_input_tokens"]
    return (uncached * uncached_rate + usage["cached_input_tokens"] * cached_rate
            + usage.get("cache_write_input_tokens", 0) * cache_write_rate
            + usage["output_tokens"] * output_rate) / 1_000_000


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def measure(
        thread_id: str,
        node_id: str,
        *,
        start: str | None = None,
        end: str | None = None,
) -> dict[str, object]:
    path = rollout_for(thread_id)
    model_by_turn: dict[str, str] = {}
    records: dict[str, dict[str, object]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        payload = row.get("payload", {})
        if row.get("type") == "turn_context":
            model_by_turn[payload["turn_id"]] = payload["model"]
        elif row.get("type") == "token_usage_record":
            timestamp = row.get("timestamp")
            if not isinstance(timestamp, str):
                raise RuntimeError(f"token record in {thread_id} has no timestamp")
            if start is not None and _instant(timestamp) < _instant(start):
                continue
            if end is not None and _instant(timestamp) > _instant(end):
                continue
            records[payload["response_id"]] = payload
    totals = {key: 0 for key in ("input_tokens", "cached_input_tokens", "cache_write_input_tokens",
                                 "output_tokens", "reasoning_output_tokens", "total_tokens")}
    costs: dict[str, float] = {}
    max_request_input = 0
    long_context_responses = 0
    for payload in records.values():
        usage = payload["usage"]
        for key in totals:
            totals[key] += int(usage.get(key, 0))
        model = model_by_turn.get(payload["turn_id"])
        if model not in RATES:
            raise RuntimeError(f"missing pricing/model context for {thread_id} response {payload['response_id']}: {model}")
        costs[model] = costs.get(model, 0.0) + price_record(model, usage)
        max_request_input = max(max_request_input, int(usage["input_tokens"]))
        long_context_responses += int(usage["input_tokens"] > 272_000)
    models = sorted(set(model_by_turn.values()))
    return {
        "thread_id": thread_id,
        "node_id": node_id,
        "rollout": str(path),
        "models": models,
        "responses": len(records),
        "usage": {**totals, "uncached_input_tokens": totals["input_tokens"] - totals["cached_input_tokens"]},
        "api_equivalent_usd": round(sum(costs.values()), 8),
        "api_equivalent_usd_by_model": {key: round(value, 8) for key, value in sorted(costs.items())},
        "max_request_input_tokens": max_request_input,
        "long_context_responses": long_context_responses,
        "measurement_window": {"start": start, "end": end},
    }


def sum_usage(items: list[dict[str, object]]) -> dict[str, int]:
    keys = ("input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens",
            "reasoning_output_tokens", "total_tokens", "uncached_input_tokens")
    return {key: sum(int(item["usage"][key]) for item in items) for key in keys}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("run_id")
    parser.add_argument("--run-status", default="unknown")
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--nodes",
        help="comma-separated node IDs to include; controller usage ends when the last selected node succeeds",
    )
    parser.add_argument(
        "--exclude-controller",
        action="store_true",
        help="measure Run-owned native sessions only when the outer controller is not part of the requested scope",
    )
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f-]{36}", args.run_id):
        parser.error("run_id must be a UUID")
    run_events = (CODEX_HOME / "codex-agents-workflow" / "workflow-runs"
                  / f"run-{args.run_id}.run" / "events.jsonl")
    events = load_run_events(run_events)
    selected_nodes = (
        {node.strip() for node in args.nodes.split(",") if node.strip()}
        if args.nodes
        else None
    )
    threads = run_thread_nodes(events, selected_nodes)
    native = [measure(thread_id, node_id) for thread_id, node_id in sorted(threads.items())]
    controller_scope = run_controller_scope(events, selected_nodes)
    controller = (
        None
        if args.exclude_controller
        else measure(
            controller_scope["thread_id"],
            "controller",
            start=controller_scope["start"],
            end=controller_scope["end"],
        )
    )
    all_sessions = [*native] if controller is None else [controller, *native]
    by_node: dict[str, dict[str, object]] = {}
    for item in native:
        group = by_node.setdefault(item["node_id"], {"sessions": 0, "responses": 0, "items": []})
        group["sessions"] += 1
        group["responses"] += item["responses"]
        group["items"].append(item)
    for node_id, group in by_node.items():
        items = group.pop("items")
        group["usage"] = sum_usage(items)
        group["api_equivalent_usd"] = round(sum(float(item["api_equivalent_usd"]) for item in items), 8)

    report = {
        "schema": "zenonzard-rollout-usage/v2",
        "run_id": args.run_id,
        "run_status": args.run_status,
        "selected_nodes": sorted(selected_nodes) if selected_nodes is not None else None,
        "controller_scope": controller_scope,
        "pricing": {
            "basis": "OpenAI Standard rates; requests above 272K input use the documented long-context multipliers",
            "rates_per_million": RATES,
        },
        "controller": controller,
        "controller_included": controller is not None,
        "native_sessions": native,
        "nodes": dict(sorted(by_node.items())),
        "native_totals": {
            "usage": sum_usage(native),
            "api_equivalent_usd": round(sum(float(item["api_equivalent_usd"]) for item in native), 8),
        },
        "all_online_totals": {
            "usage": sum_usage(all_sessions),
            "api_equivalent_usd": round(sum(float(item["api_equivalent_usd"]) for item in all_sessions), 8),
        },
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
