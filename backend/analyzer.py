import ast
import os
import re
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

MAX_ANALYZED_FILES = int(os.getenv("ANALYZER_MAX_FILES", "2000"))
MAX_GIT_COMMITS = int(os.getenv("ANALYZER_MAX_COMMITS", "2500"))
GIT_CLONE_DEPTH = int(os.getenv("GIT_CLONE_DEPTH", "500"))

import lizard
from git import Repo
from radon.complexity import cc_visit
from cfg_analyzer import analyze_reachability
from dfg_analyzer import analyze_dataflow


def clone_repo(repo_url: str) -> tuple[str, Repo]:
    tmp_dir = tempfile.mkdtemp(prefix="telemetryx_")
    clone_kwargs: dict[str, Any] = {}
    
    # Use shallow-since for the last 120 days to ensure we get all 90-day data accurately without full clone
    since_date = (datetime.now(timezone.utc) - timedelta(days=120)).strftime("%Y-%m-%d")
    clone_kwargs["shallow_since"] = since_date
    clone_kwargs["single_branch"] = True
    
    try:
        repo = Repo.clone_from(repo_url, tmp_dir, **clone_kwargs)
    except Exception:
        # Fallback to standard clone if shallow_since fails (e.g., local repo, unsupported git server)
        repo = Repo.clone_from(repo_url, tmp_dir, depth=MAX_GIT_COMMITS)
        
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


def _metrics_from_lizard(file_path: str) -> dict[str, float | int | str]:
    analysis = lizard.analyze_file(file_path)
    functions = analysis.function_list

    if functions:
        cognitive = sum(
            getattr(f, "cognitive_complexity", f.cyclomatic_complexity) for f in functions
        ) / len(functions)
        function_count = len(functions)
        # Keep the whole record for the worst function, not just its score,
        # so downstream explanations can point at real code (name + lines)
        # instead of a bare number.
        worst_fn = max(functions, key=lambda f: f.cyclomatic_complexity)
        max_fn_complexity = worst_fn.cyclomatic_complexity
        worst_fn_name = worst_fn.name
        worst_fn_start = getattr(worst_fn, "start_line", 0)
        worst_fn_end = getattr(worst_fn, "end_line", 0)
    else:
        cognitive = 0.0
        function_count = 0
        max_fn_complexity = 0
        worst_fn_name = ""
        worst_fn_start = 0
        worst_fn_end = 0

    return {
        "cognitive_complexity": round(cognitive, 2),
        "lines_of_code": analysis.nloc,
        "function_count": function_count,
        "max_fn_complexity": int(max_fn_complexity),
        "worst_function_name": worst_fn_name,
        "worst_function_start": int(worst_fn_start),
        "worst_function_end": int(worst_fn_end),
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





# Enterprise tier — first-class analysis (complexity + imports + test pairing)
ENTERPRISE_LANGUAGE_EXTENSIONS: dict[str, frozenset[str]] = {
    "javascript": frozenset({".js", ".jsx", ".mjs", ".cjs"}),
    "typescript": frozenset({".ts", ".tsx"}),
    "java": frozenset({".java"}),
    "go": frozenset({".go"}),
    "python": frozenset({".py"}),
}

ENTERPRISE_SOURCE_EXTENSIONS = frozenset(
    ext for group in ENTERPRISE_LANGUAGE_EXTENSIONS.values() for ext in group
)

# Native Lizard AST languages (full cyclomatic / cognitive complexity)
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


BUG_REGEX = re.compile(r'\b(?:fix|bug|hotfix|revert|patch|broken)\b', re.IGNORECASE)


def _commit_changed_files(commit) -> list[str]:
    try:
        return list(commit.stats.files.keys())
    except Exception:
        try:
            if commit.parents:
                diffs = commit.parents[0].diff(commit)
                return [d.b_path for d in diffs if d.b_path]
            return [
                entry.path
                for entry in commit.tree.traverse()
                if entry.type == "blob"
            ]
        except Exception:
            return []


def extract_git_signals(
    git_repo: Repo, source_files: list[Path], root: Path
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """
    Per-file git history signals and co-change pairs (last 90 days, count >= 3).
    Returns (file_signals, co_change_pairs).
    """
    scanned_set = {
        str(file.relative_to(root)).replace("\\", "/") for file in source_files
    }
    file_commits: dict[str, list] = {}
    co_change_counts: dict[tuple[str, str], int] = {}
    since_90d = datetime.now(timezone.utc) - timedelta(days=90)

    try:
        all_commits = list(git_repo.iter_commits("HEAD", max_count=MAX_GIT_COMMITS))
    except Exception:
        return {}, []

    for commit in all_commits:
        changed_files = [f.replace("\\", "/") for f in _commit_changed_files(commit)]
        scanned_changed = [f for f in changed_files if f in scanned_set]

        commit_dt = datetime.fromtimestamp(commit.committed_date, tz=timezone.utc)
        if commit_dt >= since_90d and len(scanned_changed) <= 30:
            for i in range(len(scanned_changed)):
                for j in range(i + 1, len(scanned_changed)):
                    f1, f2 = scanned_changed[i], scanned_changed[j]
                    if f1 > f2:
                        f1, f2 = f2, f1
                    co_change_counts[(f1, f2)] = co_change_counts.get((f1, f2), 0) + 1

        for f in scanned_changed:
            file_commits.setdefault(f, []).append(commit)

    co_change_pairs = [
        {"file_a": f1, "file_b": f2, "co_change_count": count}
        for (f1, f2), count in co_change_counts.items()
        if count >= 3
    ]

    results: dict[str, dict[str, Any]] = {}
    current_time = datetime.now(timezone.utc)

    for f in scanned_set:
        commits_for_file = file_commits.get(f, [])
        total_commits = len(commits_for_file)

        if total_commits == 0:
            results[f] = {
                "commit_timestamps": [],
                "unique_author_count": 0,
                "unique_authors_30d": 0,
                "top_author_pct": 0.0,
                "bug_fix_ratio": 0.0,
                "days_since_last_commit": 999,
                "co_changes": {},
            }
            continue

        timestamps: list[int] = []
        authors: list[str] = []
        bug_commits_count = 0

        churn_90d = sum(
            1 for c in commits_for_file 
            if datetime.fromtimestamp(c.committed_date, tz=timezone.utc) >= since_90d
        )

        for c in commits_for_file:
            timestamps.append(c.committed_date)
            authors.append(c.author.name or "unknown")
            msg = c.message or ""
            if BUG_REGEX.search(msg):
                bug_commits_count += 1

        unique_author_count = len(set(authors))
        cutoff_30d = current_time - timedelta(days=30)
        authors_30d = []
        for c in commits_for_file:
            commit_dt = datetime.fromtimestamp(c.committed_date, tz=timezone.utc)
            if commit_dt >= cutoff_30d:
                authors_30d.append(c.author.name or "unknown")
        unique_authors_30d = len(set(authors_30d))

        author_freq: dict[str, int] = {}
        for a in authors:
            author_freq[a] = author_freq.get(a, 0) + 1
        max_author_commits = max(author_freq.values()) if author_freq else 0
        top_author_pct = (
            round(max_author_commits / total_commits, 4) if total_commits > 0 else 0.0
        )
        bug_fix_ratio = (
            round(bug_commits_count / total_commits, 4) if total_commits > 0 else 0.0
        )

        last_commit = commits_for_file[0]
        last_commit_dt = datetime.fromtimestamp(
            last_commit.committed_date, tz=timezone.utc
        )
        days_since_last_commit = max(0, (current_time - last_commit_dt).days)

        co_changes: dict[str, int] = {}
        for pair in co_change_pairs:
            if pair["file_a"] == f:
                co_changes[pair["file_b"]] = pair["co_change_count"]
            elif pair["file_b"] == f:
                co_changes[pair["file_a"]] = pair["co_change_count"]

        results[f] = {
            "commit_timestamps": timestamps,
            "unique_author_count": unique_author_count,
            "unique_authors_30d": unique_authors_30d,
            "top_author_pct": top_author_pct,
            "bug_fix_ratio": bug_fix_ratio,
            "days_since_last_commit": days_since_last_commit,
            "co_changes": co_changes,
            "churn_90d": churn_90d,
        }

    return results, co_change_pairs


IGNORED_DIRS = {
    "venv",
    ".venv",
    "env",
    ".env",
    "myenv",
    "node_modules",
    "vendor",
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
    "coverage",
    "testdata",
}


def should_ignore_path(path: Path) -> bool:
    """Check if the path contains any segment starting with '.' or in IGNORED_DIRS."""
    for part in path.parts:
        part_lower = part.lower()
        if part.startswith(".") or part_lower in IGNORED_DIRS:
            return True
    return False


def detect_language(rel_path: str) -> str:
    """Map a repo-relative path to a language id (enterprise + extended set)."""
    ext = Path(rel_path).suffix.lower()
    for lang, extensions in ENTERPRISE_LANGUAGE_EXTENSIONS.items():
        if ext in extensions:
            return lang
    if ext in LIZARD_NATIVE_EXTENSIONS:
        return ext.lstrip(".") or "unknown"
    if ext in SUPPORTED_EXTENSIONS:
        return ext.lstrip(".") or "unknown"
    return "unknown"


def analyze_source_files(
    repo_path: str, git_repo: Repo | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Analyze source files across Python, JavaScript/TypeScript, Java, Go, and more.
    Uses Lizard for cyclomatic complexity on supported languages; git signals are language-agnostic.
    """
    root = Path(repo_path)
    all_files = []
    for ext in ENTERPRISE_SOURCE_EXTENSIONS:
        all_files.extend(root.rglob(f"*{ext}"))

    source_files = sorted(
        {p for p in all_files if not should_ignore_path(p)},
        key=lambda p: str(p).lower(),
    )
    if len(source_files) > MAX_ANALYZED_FILES:
        source_files = source_files[:MAX_ANALYZED_FILES]
    git_signals: dict[str, dict[str, Any]] = {}
    co_change_pairs: list[dict[str, Any]] = []
    if git_repo:
        git_signals, co_change_pairs = extract_git_signals(
            git_repo, source_files, root
        )
    test_loc_index = _build_test_loc_index(source_files, root)
    results: list[dict[str, Any]] = []

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def process_file(file: Path) -> dict[str, Any] | None:
        rel_path = str(file.relative_to(root)).replace("\\", "/")
        if is_test_file(rel_path):
            return None

        try:
            source = file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None

        ext = file.suffix.lower()

        reachability_issues = []
        dfg_issues = []
        if ext == ".py":
            cyclomatic = _cyclomatic_from_radon(source)
            try:
                reachability_issues = analyze_reachability(source)
            except Exception:
                reachability_issues = []
            try:
                dfg_issues = analyze_dataflow(source)
            except Exception:
                dfg_issues = []
            try:
                lizard_metrics = _metrics_from_lizard(str(file))
            except Exception:
                lizard_metrics = {
                    "cognitive_complexity": 1.0,
                    "lines_of_code": len([line for line in source.splitlines() if line.strip()]),
                    "function_count": 0,
                    "max_fn_complexity": 0,
                    "worst_function_name": "",
                    "worst_function_start": 0,
                    "worst_function_end": 0,
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
                    "worst_function_name": "",
                    "worst_function_start": 0,
                    "worst_function_end": 0,
                }
        else:
            cyclomatic = 1.0
            nloc = len([line for line in source.splitlines() if line.strip()])
            lizard_metrics = {
                "cognitive_complexity": 1.0,
                "lines_of_code": max(1, nloc),
                "function_count": 0,
                "max_fn_complexity": 0,
                "worst_function_name": "",
                "worst_function_start": 0,
                "worst_function_end": 0,
            }

        source_loc = max(1, int(lizard_metrics["lines_of_code"]))
        stem_key = _stem_key(rel_path)
        test_loc = test_loc_index.get(stem_key, 0)
        coverage_ratio = round(min(1.0, test_loc / source_loc), 4)

        imports_list = _extract_imports_multi(file, source)

        signals = git_signals.get(rel_path, {
            "commit_timestamps": [],
            "unique_author_count": 0,
            "unique_authors_30d": 0,
            "top_author_pct": 0.0,
            "bug_fix_ratio": 0.0,
            "days_since_last_commit": 0,
            "co_changes": {},
            "churn_90d": 0,
        })

        return {
            "file_path": rel_path,
            "language": detect_language(rel_path),
            "cyclomatic_complexity": round(cyclomatic, 2),
            "cognitive_complexity": lizard_metrics["cognitive_complexity"],
            "lines_of_code": lizard_metrics["lines_of_code"],
            "function_count": lizard_metrics["function_count"],
            "max_fn_complexity": lizard_metrics["max_fn_complexity"],
            "worst_function_name": lizard_metrics.get("worst_function_name", ""),
            "worst_function_start": lizard_metrics.get("worst_function_start", 0),
            "worst_function_end": lizard_metrics.get("worst_function_end", 0),
            "fan_out": len(imports_list),
            "imports": ",".join(imports_list),
            "churn_90d": signals.get("churn_90d", 0),
            "test_coverage_ratio": coverage_ratio,
            "commit_timestamps": signals["commit_timestamps"],
            "unique_author_count": signals["unique_author_count"],
            "unique_authors_30d": signals.get("unique_authors_30d", 0),
            "top_author_pct": signals["top_author_pct"],
            "bug_fix_ratio": signals["bug_fix_ratio"],
            "days_since_last_commit": signals["days_since_last_commit"],
            "co_changes": signals["co_changes"],
            "reachability_issues": reachability_issues,
            "dfg_issues": dfg_issues,
        }

    with ThreadPoolExecutor(max_workers=min(32, (os.cpu_count() or 4) * 4)) as executor:
        futures = {executor.submit(process_file, f): f for f in source_files}
        for future in as_completed(futures):
            res = future.result()
            if res is not None:
                results.append(res)

    return results, co_change_pairs


# Backward-compatible alias
analyze_python_files = analyze_source_files


def analyze_repo(repo_url: str) -> list[dict[str, Any]]:
    repo_path, git_repo = clone_repo(repo_url)
    try:
        modules, _ = analyze_source_files(repo_path, git_repo)
        return modules
    finally:
        shutil.rmtree(repo_path, ignore_errors=True)


def supported_languages_summary() -> dict[str, Any]:
    """API-facing summary of analyzer language coverage."""
    return {
        "enterprise": {
            lang: sorted(exts) for lang, exts in ENTERPRISE_LANGUAGE_EXTENSIONS.items()
        },
        "extended_count": len(SUPPORTED_EXTENSIONS),
        "complexity_via_lizard": sorted(LIZARD_NATIVE_EXTENSIONS),
    }