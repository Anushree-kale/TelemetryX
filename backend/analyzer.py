import ast
import re
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


def _cyclomatic_from_lizard(analysis) -> float:
    functions = analysis.function_list
    if not functions:
        return 0.0
    return sum(f.cyclomatic_complexity for f in functions) / len(functions)


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


def _extract_imports_multi(file_path: Path, source: str) -> list[str]:
    ext = file_path.suffix.lower()
    if ext == ".py":
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return []
        modules = set()
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
        return sorted(list(modules))

    imports = set()
    if ext in (".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"):
        for match in re.finditer(r'\bimport\b.*?from\s+[\'"]([^\'"]+)[\'"]', source):
            imports.add(match.group(1).split('/')[-1])
        for match in re.finditer(r'\bimport\s+[\'"]([^\'"]+)[\'"]', source):
            imports.add(match.group(1).split('/')[-1])
        for match in re.finditer(r'\brequire\(\s*[\'"]([^\'"]+)[\'"]\s*\)', source):
            imports.add(match.group(1).split('/')[-1])

    elif ext in (".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hh"):
        for match in re.finditer(r'#include\s*[<"]([^>"]+)[>"]', source):
            imports.add(Path(match.group(1)).stem)

    elif ext == ".java":
        for match in re.finditer(r'\bimport\s+([\w\.]+);', source):
            parts = match.group(1).split('.')
            if parts:
                imports.add(parts[-1])

    elif ext == ".go":
        for match in re.finditer(r'\bimport\s+"([^"]+)"', source):
            imports.add(match.group(1).split('/')[-1])
        for match in re.finditer(r'\bimport\s*\(((?:[^)]|\n)*)\)', source):
            block = match.group(1)
            for inner in re.finditer(r'"([^"]+)"', block):
                imports.add(inner.group(1).split('/')[-1])

    elif ext == ".rs":
        for match in re.finditer(r'\buse\s+([\w_]+)(?:::|;)', source):
            top = match.group(1)
            if top and top not in ("std", "core", "alloc", "crate", "self", "super"):
                imports.add(top)

    elif ext == ".cs":
        for match in re.finditer(r'\busing\s+([\w\.]+);', source):
            parts = match.group(1).split('.')
            if parts:
                imports.add(parts[-1])

    elif ext == ".php":
        for match in re.finditer(r'\buse\s+([\w\\]+);', source):
            parts = match.group(1).split('\\')
            if parts:
                imports.add(parts[-1])

    elif ext == ".swift":
        for match in re.finditer(r'\bimport\s+([\w_]+)', source):
            imports.add(match.group(1))

    return sorted(list(imports))


def is_test_file(rel_path: str) -> bool:
    path = Path(rel_path)
    name = path.name.lower()
    parts = {p.lower() for p in path.parts}

    if "tests" in parts or "test" in parts or "__tests__" in parts or "testing" in parts:
        return True

    ext = path.suffix.lower()
    if ext == ".py":
        return name.startswith("test_") or name.endswith("_test.py")
    elif ext in (".js", ".ts", ".jsx", ".tsx"):
        return (
            name.endswith(".test.js") or name.endswith(".test.ts") or
            name.endswith(".test.jsx") or name.endswith(".test.tsx") or
            name.endswith(".spec.js") or name.endswith(".spec.ts") or
            name.endswith(".spec.jsx") or name.endswith(".spec.tsx") or
            name.startswith("test.") or name.startswith("spec.")
        )
    elif ext == ".go":
        return name.endswith("_test.go")
    elif ext == ".java":
        return name.endswith("test.java") or name.endswith("tests.java")
    elif ext in (".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hh"):
        return "test" in name or name.startswith("test_")
    elif ext == ".rs":
        return "test" in name or name.startswith("test_") or "test" in rel_path

    return "test" in name or "spec" in name


def _stem_key(rel_path: str) -> str:
    stem = Path(rel_path).stem.lower()
    for suffix in [".test", ".spec", "_test", "test", "tests"]:
        if stem.endswith(suffix):
            stem = stem[:-len(suffix)]
    if stem.startswith("test_"):
        stem = stem[5:]
    elif stem.startswith("test."):
        stem = stem[5:]
    return stem.replace("_", "").replace(".", "").strip()


def _build_test_loc_index(source_files: list[Path], root: Path) -> dict[str, int]:
    index: dict[str, int] = {}
    for file in source_files:
        rel = str(file.relative_to(root)).replace("\\", "/")
        if not is_test_file(rel):
            continue
        try:
            loc = lizard.analyze_file(str(file)).nloc
        except Exception:
            try:
                # Fallback simple line count
                source = file.read_text(encoding="utf-8", errors="replace")
                loc = len([line for line in source.splitlines() if line.strip()])
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


# Native Lizard Ast Parsed Languages (full complexity support)
LIZARD_NATIVE_EXTENSIONS = {
    ".py",
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".java",
    ".go",
    ".rs",  # Rust fully supported natively by Lizard
    ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hh",
    ".cs",  # C#
    ".php",
    ".rb",  # Ruby
    ".swift",
    ".m", ".mm",  # Objective-C
    ".kt", ".kts",  # Kotlin
    ".scala",
    ".lua",
    ".gd",  # GDScript
    ".ttcn3",
}

# 30+ Programming, scripting, markup and configuration languages
SUPPORTED_EXTENSIONS = LIZARD_NATIVE_EXTENSIONS.union({
    # Shell & scripting languages
    ".sh", ".bash",
    ".ps1",
    # Database
    ".sql",
    # Other languages
    ".dart",
    ".pl", ".pm",  # Perl
    ".r",
    ".hs",  # Haskell
    ".clj", ".cljs",  # Clojure
    ".ex", ".exs",  # Elixir
    ".erl", ".hrl",  # Erlang
    ".groovy",
    ".jl",  # Julia
    ".sol",  # Solidity
    ".zig",
    ".fs", ".fsi",  # F#
    # Markup and documents
    ".html", ".htm",
    ".css", ".scss", ".sass", ".less",
    ".yaml", ".yml",
    ".json",
    ".md",
})


def analyze_python_files(repo_path: str, git_repo: Repo | None = None) -> list[dict[str, Any]]:
    root = Path(repo_path)
    all_files = []
    for ext in SUPPORTED_EXTENSIONS:
        all_files.extend(root.rglob(f"*{ext}"))

    source_files = [
        p
        for p in all_files
        if not any(part.startswith(".") for part in p.parts)
    ]
    test_loc_index = _build_test_loc_index(source_files, root)
    results: list[dict[str, Any]] = []

    for file in source_files:
        rel_path = str(file.relative_to(root)).replace("\\", "/")
        if is_test_file(rel_path):
            continue

        try:
            source = file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        ext = file.suffix.lower()

        # 1. Cyclomatic & AST metric calculations
        if ext == ".py":
            cyclomatic = _cyclomatic_from_radon(source)
            try:
                lizard_metrics = _metrics_from_lizard(str(file))
            except Exception:
                lizard_metrics = {
                    "cognitive_complexity": 1.0,
                    "lines_of_code": len([line for line in source.splitlines() if line.strip()]),
                    "function_count": 0,
                    "max_fn_complexity": 0,
                }
        elif ext in LIZARD_NATIVE_EXTENSIONS:
            try:
                lizard_analysis = lizard.analyze_file(str(file))
                cyclomatic = _cyclomatic_from_lizard(lizard_analysis)
                lizard_metrics = _metrics_from_lizard(str(file))
            except Exception:
                cyclomatic = 1.0
                lizard_metrics = {
                    "cognitive_complexity": 1.0,
                    "lines_of_code": len([line for line in source.splitlines() if line.strip()]),
                    "function_count": 0,
                    "max_fn_complexity": 0,
                }
        else:
            # Safe Fallback for non-AST languages (like SQL, HTML, CSS, JSON, YAML)
            cyclomatic = 1.0
            nloc = len([line for line in source.splitlines() if line.strip()])
            lizard_metrics = {
                "cognitive_complexity": 1.0,
                "lines_of_code": max(1, nloc),
                "function_count": 0,
                "max_fn_complexity": 0,
            }

        source_loc = max(1, int(lizard_metrics["lines_of_code"]))
        stem_key = _stem_key(rel_path)
        test_loc = test_loc_index.get(stem_key, 0)
        coverage_ratio = round(min(1.0, test_loc / source_loc), 4)

        churn = compute_churn_90d(git_repo, rel_path) if git_repo else 0

        imports_list = _extract_imports_multi(file, source)

        results.append(
            {
                "file_path": rel_path,
                "cyclomatic_complexity": round(cyclomatic, 2),
                "cognitive_complexity": lizard_metrics["cognitive_complexity"],
                "lines_of_code": lizard_metrics["lines_of_code"],
                "function_count": lizard_metrics["function_count"],
                "max_fn_complexity": lizard_metrics["max_fn_complexity"],
                "fan_out": len(imports_list),
                "imports": ",".join(imports_list),
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
