"""Build NetworkX dependency graphs from Python imports and co-change pairs."""

from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

import networkx as nx
from networkx.algorithms.community import greedy_modularity_communities

from analyzer import _extract_imports_multi


IGNORED_DIRS = {
    "venv",
    ".venv",
    "env",
    ".env",
    "myenv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    "out",
    "target",
    ".git",
    ".github",
    ".idea",
    ".vscode",
    ".next",
    "site-packages",
}


def should_ignore_path(path: Path) -> bool:
    """Check if the path contains any segment starting with '.' or in IGNORED_DIRS."""
    for part in path.parts:
        part_lower = part.lower()
        if part.startswith(".") or part_lower in IGNORED_DIRS:
            return True
    return False


def _py_files_in_repo(repo_path: str) -> dict[str, str]:
    """Map repo-relative paths and module names to file paths."""
    root = Path(repo_path)
    path_set: set[str] = set()
    module_to_path: dict[str, str] = {}

    for py_file in root.rglob("*.py"):
        if should_ignore_path(py_file):
            continue
        rel = str(py_file.relative_to(root)).replace("\\", "/")
        path_set.add(rel)
        stem = py_file.stem
        module_to_path[stem.lower()] = rel
        parts = rel.replace(".py", "").split("/")
        dotted = ".".join(parts)
        module_to_path[dotted.lower()] = rel
        if len(parts) > 1:
            module_to_path[".".join(parts[-2:]).lower()] = rel

    return {"paths": path_set, "modules": module_to_path}


def _resolve_import(
    node: ast.Import | ast.ImportFrom,
    current_file: str,
    module_map: dict[str, str],
    path_set: set[str],
) -> list[str]:
    resolved: list[str] = []
    current_dir = str(Path(current_file).parent).replace("\\", "/")

    if isinstance(node, ast.Import):
        for alias in node.names:
            name = alias.name
            top = name.split(".")[0]
            if top == "__future__":
                continue
            candidates = [
                module_map.get(name.lower()),
                module_map.get(top.lower()),
                f"{current_dir}/{top}.py".replace("//", "/") if current_dir != "." else f"{top}.py",
                f"{current_dir}/{top}/__init__.py".replace("//", "/") if current_dir != "." else f"{top}/__init__.py",
            ]
            for c in candidates:
                if c and c in path_set and c != current_file:
                    resolved.append(c)
                    break

    elif isinstance(node, ast.ImportFrom):
        if node.level and node.level > 0:
            base_parts = current_dir.split("/") if current_dir != "." else []
            pkg_parts = base_parts[: max(0, len(base_parts) - (node.level - 1))]
            if node.module:
                pkg_parts.extend(node.module.split("."))
            rel_base = "/".join(pkg_parts)
        elif node.module:
            rel_base = node.module.replace(".", "/")
        else:
            return resolved

        if node.names and node.names[0].name == "*":
            init_path = f"{rel_base}/__init__.py"
            mod_path = f"{rel_base}.py"
            for c in (init_path, mod_path):
                if c in path_set and c != current_file:
                    resolved.append(c)
        else:
            for alias in node.names:
                if alias.name == "*":
                    continue
                candidates = [
                    f"{rel_base}/{alias.name}.py",
                    f"{rel_base}.py",
                    module_map.get(f"{node.module}.{alias.name}".lower() if node.module else alias.name.lower()),
                    module_map.get(alias.name.lower()),
                ]
                for c in candidates:
                    if c and c in path_set and c != current_file:
                        resolved.append(c)
                        break

    return list(dict.fromkeys(resolved))


def collect_python_import_edges(repo_path: str) -> list[tuple[str, str, int]]:
    """Return (source, target, symbol_count) for resolved Python imports."""
    info = _py_files_in_repo(repo_path)
    path_set = info["paths"]
    module_map = info["modules"]
    edges: dict[tuple[str, str], int] = {}

    root = Path(repo_path)
    for py_file in root.rglob("*.py"):
        if should_ignore_path(py_file):
            continue
        rel = str(py_file.relative_to(root)).replace("\\", "/")
        try:
            source = py_file.read_text(encoding="utf-8", errors="replace")
            tree = ast.parse(source)
        except (OSError, SyntaxError):
            continue

        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                targets = _resolve_import(node, rel, module_map, path_set)
                symbol_count = (
                    len(node.names)
                    if isinstance(node, ast.Import)
                    else len([a for a in node.names if a.name != "*"]) or 1
                )
                for target in targets:
                    key = (rel, target)
                    edges[key] = edges.get(key, 0) + symbol_count

    return [(a, b, w) for (a, b), w in edges.items()]


def collect_import_edges(
    repo_path: str, file_paths: set[str]
) -> list[tuple[str, str, int]]:
    """
    Resolve import/require edges for all analyzed source files (not Python-only).
    Uses regex-based import extraction aligned with analyzer.py.
    """
    root = Path(repo_path)
    stem_map: dict[str, list[str]] = {}
    for fp in file_paths:
        stem = Path(fp).stem.lower()
        stem_map.setdefault(stem, []).append(fp)

    edges: dict[tuple[str, str], int] = {}

    for fp in file_paths:
        path = root / fp
        if not path.is_file():
            continue
        try:
            source = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        imports = _extract_imports_multi(path, source)
        for token in imports:
            token_key = token.split(".")[-1].lower() if "." in token else token.lower()
            for target in stem_map.get(token_key, []):
                if target != fp:
                    key = (fp, target)
                    edges[key] = edges.get(key, 0) + 1

    return [(a, b, w) for (a, b), w in edges.items()]


def build_dependency_graph(
    modules: list[dict[str, Any]],
    co_change_pairs: list[dict[str, Any]],
    repo_path: str | None = None,
) -> tuple[nx.DiGraph, dict[str, dict[str, Any]], dict[str, Any]]:
    """
    Build DiGraph with import and co_change edges.
    Returns (G, per_node_metrics, graph_meta).
    """
    G = nx.DiGraph()
    file_paths = {m["file_path"] for m in modules}
    debt_by_path = {m["file_path"]: float(m.get("debt_score") or 0) for m in modules}

    for fp in file_paths:
        G.add_node(fp)

    if repo_path:
        edge_weights: dict[tuple[str, str], int] = {}
        for src, tgt, weight in collect_python_import_edges(repo_path) + collect_import_edges(
            repo_path, file_paths
        ):
            if src in file_paths and tgt in file_paths:
                key = (src, tgt)
                edge_weights[key] = edge_weights.get(key, 0) + weight
        for (src, tgt), weight in edge_weights.items():
            if G.has_edge(src, tgt):
                G[src][tgt]["weight"] += weight
            else:
                G.add_edge(src, tgt, type="import", weight=weight)
    else:
        stem_map: dict[str, str] = {}
        for fp in file_paths:
            stem_map[Path(fp).stem.lower()] = fp
        for m in modules:
            src = m["file_path"]
            imports_str = m.get("imports") or ""
            for token in imports_str.split(","):
                token = token.strip().lower()
                if token in stem_map:
                    tgt = stem_map[token]
                    if tgt != src:
                        G.add_edge(src, tgt, type="import", weight=1)

    for pair in co_change_pairs:
        a, b = pair["file_a"], pair["file_b"]
        count = int(pair["co_change_count"])
        if a in file_paths and b in file_paths:
            for src, tgt in ((a, b), (b, a)):
                if G.has_edge(src, tgt) and G[src][tgt].get("type") == "co_change":
                    G[src][tgt]["weight"] += count
                elif not G.has_edge(src, tgt):
                    G.add_edge(src, tgt, type="co_change", weight=count)

    betweenness = nx.betweenness_centrality(G) if G.number_of_nodes() > 1 else {}

    undirected = G.to_undirected()
    cluster_map: dict[str, int] = {}
    cluster_count = 0
    if undirected.number_of_nodes() > 0:
        communities = list(greedy_modularity_communities(undirected))
        cluster_count = len(communities)
        for idx, community in enumerate(communities):
            for node in community:
                cluster_map[node] = idx

    node_metrics: dict[str, dict[str, Any]] = {}
    for fp in file_paths:
        downstream = len(nx.descendants(G, fp)) if fp in G else 0
        node_metrics[fp] = {
            "in_degree": G.in_degree(fp) if fp in G else 0,
            "out_degree": G.out_degree(fp) if fp in G else 0,
            "betweenness": round(float(betweenness.get(fp, 0.0)), 6),
            "downstream_count": downstream,
            "cluster_id": cluster_map.get(fp, 0),
            "debt_score": debt_by_path.get(fp, 0.0),
        }

    graph_data = nx.node_link_data(G)
    meta = {
        "graph_json": graph_data,
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
        "cluster_count": cluster_count,
    }
    return G, node_metrics, meta


def graph_from_stored_json(graph_json: dict | str) -> nx.DiGraph:
    if isinstance(graph_json, str):
        graph_json = json.loads(graph_json)
    return nx.node_link_graph(graph_json, directed=True)
