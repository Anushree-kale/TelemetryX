import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/telemetryx",
)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS analysis_jobs (
    id SERIAL PRIMARY KEY,
    repo_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    status TEXT DEFAULT 'pending',
    error_detail TEXT,
    progress_pct INTEGER DEFAULT 0,
    progress_message TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS module_metrics (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    cyclomatic_complexity FLOAT,
    cognitive_complexity FLOAT,
    lines_of_code INTEGER,
    function_count INTEGER,
    churn_90d INTEGER DEFAULT 0,
    test_coverage_ratio FLOAT DEFAULT 0,
    max_fn_complexity INTEGER DEFAULT 0,
    fan_out INTEGER DEFAULT 0,
    debt_score FLOAT,
    roi_days FLOAT,
    risk_level TEXT
);

CREATE TABLE IF NOT EXISTS shap_explanations (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES module_metrics(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    shap_value FLOAT,
    contribution_pct FLOAT,
    display_value TEXT
);
"""

MIGRATION_SQL = """
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS error_detail TEXT;
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS progress_pct INTEGER DEFAULT 0;
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS progress_message TEXT DEFAULT '';
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS churn_90d INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS test_coverage_ratio FLOAT DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS max_fn_complexity INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS fan_out INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS debt_score FLOAT;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS roi_days FLOAT;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS risk_level TEXT;
"""


def get_connection():
    return psycopg2.connect(DATABASE_URL)


@contextmanager
def get_cursor(dict_cursor: bool = False):
    conn = get_connection()
    try:
        factory = psycopg2.extras.RealDictCursor if dict_cursor else None
        cur = conn.cursor(cursor_factory=factory)
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def init_schema() -> None:
    with get_cursor() as cur:
        cur.execute(SCHEMA_SQL)
        for stmt in MIGRATION_SQL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)


def create_job(repo_url: str) -> int:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO analysis_jobs (repo_url, status, progress_pct, progress_message)
            VALUES (%s, %s, 0, %s) RETURNING id
            """,
            (repo_url, "pending", "Queued"),
        )
        return cur.fetchone()[0]


def update_job_status(
    job_id: int,
    status: str,
    *,
    error_detail: str | None = None,
) -> None:
    with get_cursor() as cur:
        if error_detail is not None:
            cur.execute(
                """
                UPDATE analysis_jobs
                SET status = %s, error_detail = %s
                WHERE id = %s
                """,
                (status, error_detail, job_id),
            )
        else:
            cur.execute(
                "UPDATE analysis_jobs SET status = %s WHERE id = %s",
                (status, job_id),
            )


def update_job_progress(job_id: int, pct: int, message: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE analysis_jobs
            SET progress_pct = %s, progress_message = %s
            WHERE id = %s
            """,
            (min(100, max(0, pct)), message, job_id),
        )


def insert_module_metrics(job_id: int, metrics: list[dict[str, Any]]) -> list[int]:
    if not metrics:
        return []
    module_ids: list[int] = []
    with get_cursor() as cur:
        for m in metrics:
            cur.execute(
                """
                INSERT INTO module_metrics (
                    job_id, file_path, cyclomatic_complexity, cognitive_complexity,
                    lines_of_code, function_count, churn_90d, test_coverage_ratio,
                    max_fn_complexity, fan_out, debt_score, roi_days, risk_level
                ) VALUES (
                    %(job_id)s, %(file_path)s, %(cyclomatic_complexity)s,
                    %(cognitive_complexity)s, %(lines_of_code)s, %(function_count)s,
                    %(churn_90d)s, %(test_coverage_ratio)s, %(max_fn_complexity)s,
                    %(fan_out)s, %(debt_score)s, %(roi_days)s, %(risk_level)s
                ) RETURNING id
                """,
                {**m, "job_id": job_id},
            )
            module_ids.append(cur.fetchone()[0])
    return module_ids


def insert_shap_explanations(
    module_id: int,
    explanations: list[dict[str, Any]],
) -> None:
    if not explanations:
        return
    with get_cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO shap_explanations
                (module_id, feature, shap_value, contribution_pct, display_value)
            VALUES (%(module_id)s, %(feature)s, %(shap_value)s,
                    %(contribution_pct)s, %(display_value)s)
            """,
            [{**e, "module_id": module_id} for e in explanations],
        )


def get_job(job_id: int) -> dict[str, Any] | None:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, repo_url, created_at, status, error_detail,
                   progress_pct, progress_message
            FROM analysis_jobs WHERE id = %s
            """,
            (job_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def _attach_reasons(modules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not modules:
        return modules
    module_ids = [m["id"] for m in modules if m.get("id")]
    if not module_ids:
        for m in modules:
            m["reasons"] = []
        return modules

    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT module_id, feature, shap_value, contribution_pct, display_value
            FROM shap_explanations
            WHERE module_id = ANY(%s)
            ORDER BY contribution_pct DESC
            """,
            (module_ids,),
        )
        rows = cur.fetchall()

    by_module: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        mid = row["module_id"]
        by_module.setdefault(mid, []).append(
            {
                "feature": row["feature"],
                "contribution_pct": float(row["contribution_pct"]),
                "value": row["display_value"],
                "shap_value": float(row["shap_value"]),
            }
        )

    for m in modules:
        m["reasons"] = by_module.get(m.get("id"), [])[:3]
    return modules


def get_job_modules(job_id: int) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, file_path, cyclomatic_complexity, cognitive_complexity,
                   lines_of_code, function_count, churn_90d, test_coverage_ratio,
                   max_fn_complexity, fan_out, debt_score, roi_days, risk_level
            FROM module_metrics
            WHERE job_id = %s
            ORDER BY debt_score DESC NULLS LAST
            """,
            (job_id,),
        )
        modules = [dict(row) for row in cur.fetchall()]
    return _attach_reasons(modules)


def get_all_modules() -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT m.id, m.file_path, m.cyclomatic_complexity, m.cognitive_complexity,
                   m.lines_of_code, m.function_count, m.churn_90d,
                   m.test_coverage_ratio, m.max_fn_complexity, m.fan_out,
                   m.debt_score, m.roi_days, m.risk_level,
                   j.repo_url, j.id AS job_id
            FROM module_metrics m
            JOIN analysis_jobs j ON j.id = m.job_id
            ORDER BY m.debt_score DESC NULLS LAST
            """
        )
        modules = [dict(row) for row in cur.fetchall()]
    return _attach_reasons(modules)


def get_all_metrics_for_training() -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT cyclomatic_complexity, cognitive_complexity, churn_90d,
                   test_coverage_ratio, lines_of_code, function_count,
                   max_fn_complexity, fan_out
            FROM module_metrics
            WHERE cyclomatic_complexity IS NOT NULL
            """
        )
        return [dict(row) for row in cur.fetchall()]
