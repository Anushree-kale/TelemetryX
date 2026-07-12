import shutil
import sys
from pathlib import Path
from typing import Any

# Ensure backend directory is in sys.path
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import analyzer
import branch_analyzer
import database
import explain
import post_analysis
import redis_cache

from celery_app import celery_app
from celery.exceptions import MaxRetriesExceededError
from debt_model import get_scorer

# Maximum number of automatic retries for a failed analysis task.
_MAX_RETRIES = 3
# Seconds between retries (doubles with retry_backoff=True: 60, 120, 240 …)
_RETRY_COUNTDOWN = 60


def _enrich_metrics(raw_metrics: list[dict[str, Any]], repo_stats: dict[str, float] | None = None) -> list[dict[str, Any]]:
    scorer = get_scorer()
    if scorer.model is None:
        scorer.load()
    scored = scorer.predict_batch(raw_metrics)
    shap_rows = explain.build_shap_explanations(scorer, scored)
    for row, shap_list in zip(scored, shap_rows):
        row["_shap"] = shap_list
        row["narrative"] = explain.build_file_narrative(row, shap_list, repo_stats=repo_stats)
    return scored


def _compute_repo_stats(metrics: list[dict[str, Any]]) -> dict[str, float]:
    if not metrics:
        return {}
    
    import numpy as np
    
    def extract(key):
        return [float(m.get(key, 0) or 0) for m in metrics]

    locs = extract("lines_of_code")
    fan_outs = extract("fan_out")
    max_fns = extract("max_fn_complexity")
    churns = extract("churn_90d")
    bug_ratios = extract("bug_fix_ratio")

    return {
        "p90_loc": float(np.percentile(locs, 90)),
        "p75_fan_out": float(np.percentile(fan_outs, 75)),
        "p90_fan_out": float(np.percentile(fan_outs, 90)),
        "p95_fan_out": float(np.percentile(fan_outs, 95)),
        "p75_max_fn": float(np.percentile(max_fns, 75)),
        "p90_max_fn": float(np.percentile(max_fns, 90)),
        "p75_churn": float(np.percentile(churns, 75)),
        "p50_bug_ratio": float(np.percentile(bug_ratios, 50)),
        "p75_bug_ratio": float(np.percentile(bug_ratios, 75)),
        "p90_bug_ratio": float(np.percentile(bug_ratios, 90)),
    }


def _ensure_backend_on_path() -> None:
    app_dir = str(Path(__file__).resolve().parent)
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)


@celery_app.task(
    bind=True,
    name="tasks.analyze_repo_task",
    # Automatically retry on any exception (network blip, OOM, clone timeout, etc.)
    autoretry_for=(Exception,),
    max_retries=_MAX_RETRIES,
    retry_backoff=True,       # 60s → 120s → 240s between attempts
    retry_backoff_max=300,    # cap at 5 minutes
    retry_jitter=True,        # randomise slightly to avoid thundering-herd
    time_limit=1800,          # hard kill at 30 minutes
    soft_time_limit=1500,     # log a warning at 25 minutes
)
def analyze_repo_task(self, job_id: int, repo_url: str) -> dict[str, Any]:
    _ensure_backend_on_path()
    attempt = self.request.retries  # 0 on first run, 1 on first retry, …
    try:
        status_msg = "Running analysis…" if attempt == 0 else f"Retrying analysis (attempt {attempt + 1}/{_MAX_RETRIES + 1})…"
        database.update_job_status(job_id, "running")
        database.update_job_progress(job_id, 5, status_msg)

        cached = redis_cache.get_cached_analysis(repo_url)
        if cached:
            database.update_job_progress(job_id, 40, "Using cached analysis (recent)")
            modules = cached.get("modules", cached) if isinstance(cached, dict) else cached
            co_pairs = cached.get("co_change_pairs", []) if isinstance(cached, dict) else []

            repo_stats = _compute_repo_stats(modules)
            enriched = _enrich_metrics(modules, repo_stats)
            database.update_job_progress(job_id, 85, "Saving results…")
            _persist_results(job_id, enriched, co_pairs)
            post_analysis.run_post_analysis(job_id, co_change_pairs=co_pairs)
            database.update_job_progress(job_id, 100, "Complete")
            database.update_job_status(job_id, "complete")
            return {"job_id": job_id, "status": "complete", "cached": True}

        database.update_job_progress(job_id, 10, "Cloning repo…")
        repo_path, git_repo = analyzer.clone_repo(repo_url)

        try:
            database.update_job_progress(job_id, 25, "Computing churn & scanning files…")
            raw_metrics, co_change_pairs = analyzer.analyze_source_files(
                repo_path, git_repo
            )

            database.update_job_progress(job_id, 55, "Scanning files…")
            redis_cache.set_cached_analysis(
                repo_url,
                {"modules": raw_metrics, "co_change_pairs": co_change_pairs},
            )

            database.update_job_progress(job_id, 75, "Running models…")
            repo_stats = _compute_repo_stats(raw_metrics)
            enriched = _enrich_metrics(raw_metrics, repo_stats)

            database.update_job_progress(job_id, 90, "Saving results…")
            _persist_results(job_id, enriched, co_change_pairs)

            database.update_job_progress(job_id, 95, "Building dependency graph…")
            post_analysis.run_post_analysis(
                job_id, repo_path=repo_path, co_change_pairs=co_change_pairs
            )
            database.update_job_progress(job_id, 100, "Complete")
            database.update_job_status(job_id, "complete")
            return {"job_id": job_id, "status": "complete", "module_count": len(enriched)}
        finally:
            shutil.rmtree(repo_path, ignore_errors=True)

    except Exception as exc:
        # If we still have retries left, Celery will re-queue automatically.
        # Only mark the job as permanently failed after all retries are exhausted.
        if self.request.retries >= _MAX_RETRIES:
            database.update_job_status(job_id, "failed", error_detail=str(exc))
            database.update_job_progress(job_id, 0, "Failed after all retries")
        else:
            next_attempt = self.request.retries + 2  # human-readable: attempt 2 of 4
            database.update_job_progress(
                job_id, 0,
                f"Attempt {self.request.retries + 1} failed — retrying ({next_attempt}/{_MAX_RETRIES + 1})…"
            )
        raise  # Let Celery handle the retry / give-up logic


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


@celery_app.task(
    bind=True,
    name="tasks.analyze_branch_task",
    autoretry_for=(Exception,),
    max_retries=2,
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    time_limit=600,    # hard kill at 10 minutes (clone + LLM call)
    soft_time_limit=540,
)
def analyze_branch_task(self, job_id: int, repo_url: str, branch_name: str) -> dict:
    """Async Celery wrapper around branch_analyzer.analyze_branch_noise.

    Keeps /analyze/branch non-blocking — the handler returns a job_id immediately
    and the client polls /analyze/branch/{job_id}/result until status != pending/running.
    """
    _ensure_backend_on_path()
    try:
        database.update_job_status(job_id, "running")
        database.update_job_progress(job_id, 10, f"Fetching HEAD SHA for '{branch_name}'\u2026")

        result = branch_analyzer.analyze_branch_noise(repo_url, branch_name)

        database.update_job_progress(job_id, 100, "Complete")
        database.update_job_status(job_id, "complete")
        redis_cache.set_branch_job_result(job_id, result)
        return {"job_id": job_id, "status": "complete"}

    except Exception as exc:
        if self.request.retries >= 2:
            database.update_job_status(job_id, "failed", error_detail=str(exc))
            database.update_job_progress(job_id, 0, "Failed")
        raise