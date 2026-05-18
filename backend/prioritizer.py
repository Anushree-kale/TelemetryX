"""Compute fix priority scores and build roadmap items."""

from __future__ import annotations

from typing import Any

import networkx as nx

from graph_builder import build_dependency_graph, graph_from_stored_json


def _build_reason(
    debt_score: float,
    downstream_count: int,
    bug_fix_ratio: float,
) -> str:
    if debt_score > 70:
        return (
            f"High technical debt ({debt_score:.0f}) with {downstream_count} "
            "dependents amplifying risk"
        )
    if downstream_count > 10:
        return (
            f"Central module — {downstream_count} files depend on it; "
            "a failure cascades widely"
        )
    if bug_fix_ratio > 0.5:
        return (
            f"Historically unstable — {bug_fix_ratio:.0%} of commits are bug fixes"
        )
    return "Combined debt and coupling make this a high-leverage fix"


def compute_priorities(
    modules: list[dict[str, Any]],
    G: nx.DiGraph | None = None,
    graph_json: dict | None = None,
) -> list[dict[str, Any]]:
    """Return modules enriched with priority fields, sorted by priority_score desc."""
    if G is None:
        if graph_json:
            G = graph_from_stored_json(graph_json)
        else:
            G, _, _ = build_dependency_graph(modules, [])

    debt_by_path = {m["file_path"]: float(m.get("debt_score") or 0) for m in modules}
    max_downstream = max(
        (len(nx.descendants(G, m["file_path"])) if m["file_path"] in G else 0 for m in modules),
        default=0,
    )

    enriched: list[dict[str, Any]] = []
    for m in modules:
        fp = m["file_path"]
        debt_score = float(m.get("debt_score") or 0)
        roi_days = float(m.get("roi_days") or 0)
        downstream_count = int(m.get("downstream_count") or 0)
        if fp in G and not m.get("downstream_count"):
            downstream_count = len(nx.descendants(G, fp))

        impact_norm = (downstream_count / max(max_downstream, 1)) * 100
        effort_inv = max(0, 100 - ((roi_days / 30) * 100))

        priority_score = (
            debt_score * 0.40
            + debt_score * 0.30
            + impact_norm * 0.20
            + effort_inv * 0.10
        )

        is_critical = bool(m.get("is_critical"))
        if is_critical:
            priority_score *= 1.5

        days_since = int(m.get("days_since_last_commit") or 0)
        confidence = max(0, 1 - (days_since / 365))
        confidence_margin = priority_score * (1 - confidence) * 0.2

        descendants = list(nx.descendants(G, fp)) if fp in G else []
        cascade_benefit = sum(debt_by_path.get(d, 0) for d in descendants)
        fix_hours = roi_days * 8
        bug_fix_ratio = float(m.get("bug_fix_ratio") or 0)

        enriched.append({
            **m,
            "downstream_count": downstream_count,
            "priority_score": round(priority_score, 2),
            "confidence": round(confidence, 4),
            "confidence_margin": round(confidence_margin, 2),
            "cascade_benefit": round(cascade_benefit, 2),
            "downstream_files": descendants,
            "fix_hours": round(fix_hours, 1),
            "reason": _build_reason(debt_score, downstream_count, bug_fix_ratio),
            "impact_norm": round(impact_norm, 2),
            "effort_inv": round(effort_inv, 2),
        })

    enriched.sort(key=lambda x: x["priority_score"], reverse=True)
    for rank, item in enumerate(enriched, start=1):
        item["rank"] = rank
    return enriched


def top_roadmap_items(
    modules: list[dict[str, Any]],
    G: nx.DiGraph | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    ranked = compute_priorities(modules, G=G)
    return ranked[:limit]
