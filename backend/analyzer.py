import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

import lizard
from git import Repo
from radon.complexity import cc_visit


def clone_repo(repo_url: str) -> str:
    """Clone a public GitHub repo into a temp directory. Returns the path."""
    tmp_dir = tempfile.mkdtemp(prefix="telemetryx_")
    Repo.clone_from(repo_url, tmp_dir, depth=1)
    return tmp_dir


def _cyclomatic_from_radon(source: str) -> float:
    blocks = cc_visit(source)
    if not blocks:
        return 0.0
    return sum(b.complexity for b in blocks) / len(blocks)


def _metrics_from_lizard(file_path: str) -> dict[str, float | int]:
    analysis = lizard.analyze_file(file_path)
    functions = analysis.function_list

    if functions:
        cognitive = sum(
            getattr(f, "cognitive_complexity", f.cyclomatic_complexity) for f in functions
        ) / len(functions)
        function_count = len(functions)
    else:
        cognitive = 0.0
        function_count = 0

    return {
        "cognitive_complexity": round(cognitive, 2),
        "lines_of_code": analysis.nloc,
        "function_count": function_count,
    }


def analyze_python_files(repo_path: str) -> list[dict[str, Any]]:
    """Walk repo_path, analyze every .py file, return metric dicts."""
    root = Path(repo_path)
    results: list[dict[str, Any]] = []

    for py_file in root.rglob("*.py"):
        if any(part.startswith(".") for part in py_file.parts):
            continue

        try:
            source = py_file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        rel_path = str(py_file.relative_to(root)).replace("\\", "/")
        cyclomatic = _cyclomatic_from_radon(source)
        lizard_metrics = _metrics_from_lizard(str(py_file))

        results.append(
            {
                "file_path": rel_path,
                "cyclomatic_complexity": round(cyclomatic, 2),
                "cognitive_complexity": lizard_metrics["cognitive_complexity"],
                "lines_of_code": lizard_metrics["lines_of_code"],
                "function_count": lizard_metrics["function_count"],
            }
        )

    return results


def analyze_repo(repo_url: str) -> list[dict[str, Any]]:
    """Clone repo, analyze all Python files, clean up temp dir."""
    repo_path = clone_repo(repo_url)
    try:
        return analyze_python_files(repo_path)
    finally:
        shutil.rmtree(repo_path, ignore_errors=True)
