import tempfile
from pathlib import Path

import pytest

from analyzer import (
    ENTERPRISE_SOURCE_EXTENSIONS,
    analyze_source_files,
    detect_language,
    supported_languages_summary,
)


def test_enterprise_extensions_present():
    assert ".java" in ENTERPRISE_SOURCE_EXTENSIONS
    assert ".go" in ENTERPRISE_SOURCE_EXTENSIONS
    assert ".ts" in ENTERPRISE_SOURCE_EXTENSIONS
    assert ".js" in ENTERPRISE_SOURCE_EXTENSIONS


def test_detect_language():
    assert detect_language("src/main.java") == "java"
    assert detect_language("pkg/main.go") == "go"
    assert detect_language("web/app.tsx") == "typescript"
    assert detect_language("web/util.js") == "javascript"
    assert detect_language("app/main.py") == "python"


def test_analyze_multilanguage_repo(mock_repo: Path):
    modules, _ = analyze_source_files(str(mock_repo), git_repo=None)
    langs = {m["language"] for m in modules}
    paths = {m["file_path"] for m in modules}

    assert "python" in langs
    assert "java" in langs
    assert "go" in langs
    assert "typescript" in langs
    assert len(modules) == 4
    assert "app.py" in paths
    assert "main.java" in paths
    assert "main.go" in paths
    assert "util.ts" in paths

    for module in modules:
        assert module["lines_of_code"] > 0
        assert module["cyclomatic_complexity"] >= 0


def test_supported_languages_summary():
    summary = supported_languages_summary()
    assert "enterprise" in summary
    assert "java" in summary["enterprise"]
