import ast
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import lizard
from git import Repo
from radon.complexity import cc_visit


def clone_repo(repo_url: str) -> tuple[str, Repo]:
    tmp_dir = tempfile.mkdtemp(prefix="telemetryx_")
    repo = Repo.clone_from(repo_url, tmp_dir, depth=1)
    return tmp_dir, repo


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
        max_fn_complexity = max(f.cyclomatic_complexity for f in functions)
    else:
        cognitive = 0.0
        function_count = 0
        max_fn_complexity = 0

    return {
        "cognitive_complexity": round(cognitive, 2),
        "lines_of_code": analysis.nloc,
        "function_count": function_count,
        "max_fn_complexity": int(max_fn_complexity),
    }


def _count_fan_out(source: str) -> int:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return 0

    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top and top != "__future__":
                    modules.add(top)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                top = node.module.split(".")[0]
                if top:
                    modules.add(top)
    return len(modules)


def is_test_file(rel_path: str) -> bool:
    path = Path(rel_path)
    name = path.name.lower()
    parts = {p.lower() for p in path.parts}
    return (
        name.startswith("test_")
        or name.endswith("_test.py")
        or "tests" in parts
        or "test" in parts
    )


def _stem_key(rel_path: str) -> str:
    return Path(rel_path).stem.replace("test_", "").replace("_test", "").lower()


def _build_test_loc_index(py_files: list[Path], root: Path) -> dict[str, int]:
    index: dict[str, int] = {}
    for py_file in py_files:
        rel = str(py_file.relative_to(root)).replace("\\", "/")
        if not is_test_file(rel):
            continue
        try:
            loc = lizard.analyze_file(str(py_file)).nloc
        except Exception:
            loc = 0
        key = _stem_key(rel)
        index[key] = index.get(key, 0) + loc
    return index


def compute_churn_90d(repo: Repo, rel_path: str) -> int:
    since = datetime.now(timezone.utc) - timedelta(days=90)
    try:
        commits = list(
            repo.iter_commits(since=since.isoformat(), paths=rel_path, max_count=500)
        )
        return len(commits)
    except Exception:
        return 0


def analyze_python_files(repo_path: str, git_repo: Repo | None = None) -> list[dict[str, Any]]:
    root = Path(repo_path)
    py_files = [
        p
        for p in root.rglob("*.py")
        if not any(part.startswith(".") for part in p.parts)
    ]
    test_loc_index = _build_test_loc_index(py_files, root)
    results: list[dict[str, Any]] = []

    for py_file in py_files:
        rel_path = str(py_file.relative_to(root)).replace("\\", "/")
        if is_test_file(rel_path):
            continue

        try:
            source = py_file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        cyclomatic = _cyclomatic_from_radon(source)
        lizard_metrics = _metrics_from_lizard(str(py_file))
        source_loc = max(1, int(lizard_metrics["lines_of_code"]))
        stem_key = _stem_key(rel_path)
        test_loc = test_loc_index.get(stem_key, 0)
        coverage_ratio = round(min(1.0, test_loc / source_loc), 4)

        churn = compute_churn_90d(git_repo, rel_path) if git_repo else 0

        results.append(
            {
                "file_path": rel_path,
                "cyclomatic_complexity": round(cyclomatic, 2),
                "cognitive_complexity": lizard_metrics["cognitive_complexity"],
                "lines_of_code": lizard_metrics["lines_of_code"],
                "function_count": lizard_metrics["function_count"],
                "max_fn_complexity": lizard_metrics["max_fn_complexity"],
                "fan_out": _count_fan_out(source),
                "churn_90d": churn,
                "test_coverage_ratio": coverage_ratio,
            }
        )

    return results


def analyze_repo(repo_url: str) -> list[dict[str, Any]]:
    repo_path, git_repo = clone_repo(repo_url)
    try:
        return analyze_python_files(repo_path, git_repo)
    finally:
        shutil.rmtree(repo_path, ignore_errors=True)
