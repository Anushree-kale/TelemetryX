"""Build dependency graph and roadmap after module metrics are persisted."""

from __future__ import annotations

from typing import Any

import database
from graph_builder import build_dependency_graph
from prioritizer import compute_priorities


def run_post_analysis(
    job_id: int,
    repo_path: str | None = None,
    co_change_pairs: list[dict[str, Any]] | None = None,
) -> None:
    modules = database.get_job_modules(job_id)
    if not modules:
        return

    pairs = co_change_pairs if co_change_pairs is not None else database.get_co_change_pairs(job_id)

    G, node_metrics, meta = build_dependency_graph(modules, pairs, repo_path=repo_path)
    database.update_module_graph_metrics(job_id, node_metrics)
    database.insert_dependency_graph(
        job_id,
        meta["graph_json"],
        meta["node_count"],
        meta["edge_count"],
        meta["cluster_count"],
    )

    modules = database.get_job_modules(job_id)
    ranked = compute_priorities(modules, G=G)
    top = ranked[:10]

    roadmap_rows = [
        {
            "rank": item["rank"],
            "module_id": item["id"],
            "priority_score": item["priority_score"],
            "confidence_margin": item["confidence_margin"],
            "cascade_benefit": item["cascade_benefit"],
            "downstream_files": item["downstream_files"],
            "fix_hours": item["fix_hours"],
            "reason": item["reason"],
        }
        for item in top
    ]
    database.replace_roadmap_items(job_id, roadmap_rows)
