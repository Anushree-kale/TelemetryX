import shutil
from typing import Any

import analyzer
import database
import explain
import redis_cache
from celery_app import celery_app
from debt_model import get_scorer


def _enrich_metrics(raw_metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scorer = get_scorer()
    if scorer.model is None:
        scorer.load()
    scored = scorer.predict_batch(raw_metrics)
    shap_rows = explain.build_shap_explanations(scorer, scored)
    for row, shap_list in zip(scored, shap_rows):
        row["_shap"] = shap_list
    return scored


@celery_app.task(bind=True, name="tasks.analyze_repo_task")
def analyze_repo_task(self, job_id: int, repo_url: str) -> dict[str, Any]:
    try:
        database.update_job_status(job_id, "running")
        database.update_job_progress(job_id, 5, "Starting analysis…")

        cached = redis_cache.get_cached_analysis(repo_url)
        if cached:
            database.update_job_progress(job_id, 40, "Using cached analysis (recent)")
            enriched = _enrich_metrics(cached)
            database.update_job_progress(job_id, 85, "Saving results…")
            _persist_results(job_id, enriched)
            database.update_job_progress(job_id, 100, "Complete")
            database.update_job_status(job_id, "complete")
            return {"job_id": job_id, "status": "complete", "cached": True}

        database.update_job_progress(job_id, 10, "Cloning repo…")
        repo_path, git_repo = analyzer.clone_repo(repo_url)

        try:
            database.update_job_progress(job_id, 25, "Computing churn & scanning files…")
            raw_metrics = analyzer.analyze_python_files(repo_path, git_repo)

            database.update_job_progress(job_id, 55, "Scanning files…")
            redis_cache.set_cached_analysis(repo_url, raw_metrics)

            database.update_job_progress(job_id, 75, "Running models…")
            enriched = _enrich_metrics(raw_metrics)

            database.update_job_progress(job_id, 90, "Saving results…")
            _persist_results(job_id, enriched)

            database.update_job_progress(job_id, 100, "Complete")
            database.update_job_status(job_id, "complete")
            return {"job_id": job_id, "status": "complete", "module_count": len(enriched)}
        finally:
            shutil.rmtree(repo_path, ignore_errors=True)

    except Exception as exc:
        database.update_job_status(job_id, "failed", error_detail=str(exc))
        database.update_job_progress(job_id, 0, "Failed")
        raise


def _persist_results(job_id: int, metrics: list[dict[str, Any]]) -> None:
    rows_for_db = []
    shap_by_index: list[list[dict[str, Any]]] = []
    for m in metrics:
        shap_list = m.pop("_shap", [])
        shap_by_index.append(shap_list)
        rows_for_db.append(m)

    module_ids = database.insert_module_metrics(job_id, rows_for_db)
    for module_id, shap_list in zip(module_ids, shap_by_index):
        database.insert_shap_explanations(module_id, shap_list)
