from __future__ import annotations

import os
from pathlib import Path

import pytest


@pytest.fixture(scope="session", autouse=True)
def _test_env() -> None:
    os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/telemetryx")
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
    os.environ.setdefault("AUTH_DISABLED", "1")
    os.environ.setdefault("TELEMETRYX_ENV", "development")
    try:
        import database

        database.init_schema()
    except Exception:
        pass


@pytest.fixture
def mock_repo(tmp_path: Path) -> Path:
    """Minimal multi-file repo for analyzer and pipeline tests."""
    (tmp_path / "app.py").write_text(
        "def foo():\n    if True:\n        return 1\n",
        encoding="utf-8",
    )
    (tmp_path / "main.java").write_text(
        "public class Main {\n  public int bar() { if (true) return 1; return 0; }\n}\n",
        encoding="utf-8",
    )
    (tmp_path / "main.go").write_text(
        "package main\nfunc Baz() int {\n\tif true { return 1 }\n\treturn 0\n}\n",
        encoding="utf-8",
    )
    (tmp_path / "util.ts").write_text(
        "export function qux(): number {\n  if (true) return 1;\n  return 0;\n}\n",
        encoding="utf-8",
    )
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_app.py").write_text("def test_foo():\n    assert True\n", encoding="utf-8")
    return tmp_path


@pytest.fixture
def api_client(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as client:
        yield client
