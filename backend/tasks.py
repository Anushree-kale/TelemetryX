import shutil
from typing import Any

import analyzer
import database
import explain
import post_analysis
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
def analyze_repo_task(self, job_id: int, repo_url: str, privacy_mode: bool = False) -> dict[str, Any]:
    try:
        database.update_job_status(job_id, "running")
        database.update_job_progress(job_id, 5, "Starting analysis…")

        cached = redis_cache.get_cached_analysis(repo_url)
        if cached:
            database.update_job_progress(job_id, 40, "Using cached analysis (recent)")
            modules = cached.get("modules", cached) if isinstance(cached, dict) else cached
            co_pairs = cached.get("co_change_pairs", []) if isinstance(cached, dict) else []
            
            if privacy_mode:
                from privacy import dp_engine
                modules = dp_engine.perturb_metrics(modules)
                
            enriched = _enrich_metrics(modules)
            database.update_job_progress(job_id, 85, "Saving results…")
            _persist_results(job_id, enriched, co_pairs)
            post_analysis.run_post_analysis(job_id, co_change_pairs=co_pairs)
            predict_failures_task.delay(job_id)
            predict_burnout_task.delay(job_id)
            database.update_job_progress(job_id, 100, "Complete")
            database.update_job_status(job_id, "complete")
            return {"job_id": job_id, "status": "complete", "cached": True}

        database.update_job_progress(job_id, 10, "Cloning repo…")
        repo_path, git_repo = analyzer.clone_repo(repo_url)

        try:
            database.update_job_progress(job_id, 25, "Computing churn & scanning files…")
            raw_metrics, co_change_pairs = analyzer.analyze_python_files(
                repo_path, git_repo
            )

            database.update_job_progress(job_id, 55, "Scanning files…")
            redis_cache.set_cached_analysis(
                repo_url,
                {"modules": raw_metrics, "co_change_pairs": co_change_pairs},
            )

            database.update_job_progress(job_id, 75, "Running models…")
            if privacy_mode:
                from privacy import dp_engine
                raw_metrics = dp_engine.perturb_metrics(raw_metrics)
                
            enriched = _enrich_metrics(raw_metrics)

            database.update_job_progress(job_id, 90, "Saving results…")
            _persist_results(job_id, enriched, co_change_pairs)

            database.update_job_progress(job_id, 95, "Building dependency graph…")
            post_analysis.run_post_analysis(
                job_id, repo_path=repo_path, co_change_pairs=co_change_pairs
            )
            predict_failures_task.delay(job_id)
            predict_burnout_task.delay(job_id)
            database.update_job_progress(job_id, 100, "Complete")
            database.update_job_status(job_id, "complete")
            return {"job_id": job_id, "status": "complete", "module_count": len(enriched)}
        finally:
            shutil.rmtree(repo_path, ignore_errors=True)

    except Exception as exc:
        database.update_job_status(job_id, "failed", error_detail=str(exc))
        database.update_job_progress(job_id, 0, "Failed")
        raise


def _persist_results(
    job_id: int,
    metrics: list[dict[str, Any]],
    co_change_pairs: list[dict[str, Any]] | None = None,
) -> None:
    rows_for_db = []
    shap_by_index: list[list[dict[str, Any]]] = []
    for m in metrics:
        shap_list = m.pop("_shap", [])
        shap_by_index.append(shap_list)
        rows_for_db.append(m)

    module_ids = database.insert_module_metrics(job_id, rows_for_db)
    for module_id, shap_list in zip(module_ids, shap_by_index):
        database.insert_shap_explanations(module_id, shap_list)

    if co_change_pairs:
        database.insert_co_change_pairs(job_id, co_change_pairs)


@celery_app.task(name="tasks.predict_failures_task")
def predict_failures_task(job_id: int) -> None:
    import sys
    import pathlib
    app_dir = str(pathlib.Path(__file__).parent.resolve())
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)

    import failure_predictor
    import logging
    try:
        failure_predictor.load_failure_model()
        failure_predictor.predict_failures(job_id)
        
        import database
        import alerts
        preds = database.get_job_failure_predictions(job_id)
        alerts.send_failure_alert(job_id, preds)
    except Exception as exc:
        logging.getLogger(__name__).error(
            f"Failed to run failure predictor task for job {job_id}: {exc}",
            exc_info=True
        )


@celery_app.task(name="tasks.predict_burnout_task")
def predict_burnout_task(job_id: int) -> None:
    import sys
    import pathlib
    app_dir = str(pathlib.Path(__file__).parent.resolve())
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)

    import burnout_model
    import logging
    try:
        burnout_model.predict_burnout(job_id)
    except Exception as exc:
        logging.getLogger(__name__).error(
            f"Failed to run burnout predictor task for job {job_id}: {exc}",
            exc_info=True
        )

