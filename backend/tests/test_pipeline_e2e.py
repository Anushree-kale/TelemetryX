from pathlib import Path

from debt_model import get_scorer
from graph_builder import build_dependency_graph
from post_analysis import run_post_analysis
from prioritizer import compute_priorities

import analyzer


def test_analyzer_produces_scorable_modules(mock_repo: Path):
    modules, co_pairs = analyzer.analyze_source_files(str(mock_repo), git_repo=None)
    assert len(modules) >= 4

    scorer = get_scorer()
    scored = scorer.predict_batch(modules)
    assert all("debt_score" in row for row in scored)
    assert all(row["risk_level"] in ("low", "medium", "high") for row in scored)


def test_graph_and_priorities_from_analyzed_modules(mock_repo: Path):
    modules, co_pairs = analyzer.analyze_source_files(str(mock_repo), git_repo=None)
    scorer = get_scorer()
    scored = scorer.predict_batch(modules)

    graph, node_metrics, meta = build_dependency_graph(scored, co_pairs, repo_path=str(mock_repo))
    assert meta["node_count"] == len(scored)
    assert graph.number_of_nodes() == len(scored)

    ranked = compute_priorities(scored, G=graph)
    assert ranked
    assert ranked[0]["priority_score"] >= ranked[-1]["priority_score"]


def test_post_analysis_persists_when_db_available(mock_repo: Path, monkeypatch):
    """End-to-end persistence when PostgreSQL is reachable (CI integration job)."""
    import database

    try:
        database.init_schema()
        job_id = database.create_job("https://github.com/example/test-repo")
    except Exception:
        return

    modules, co_pairs = analyzer.analyze_source_files(str(mock_repo), git_repo=None)
    scorer = get_scorer()
    scored = scorer.predict_batch(modules)
    database.insert_module_metrics(job_id, scored)
    run_post_analysis(job_id, repo_path=str(mock_repo), co_change_pairs=co_pairs)

    stored_modules = database.get_job_modules(job_id)
    assert len(stored_modules) == len(scored)
    roadmap = database.get_roadmap_items(job_id)
    assert len(roadmap) <= 10
    graph = database.get_dependency_graph(job_id)
    assert graph is not None
