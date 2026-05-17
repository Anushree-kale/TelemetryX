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
    status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS module_metrics (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    cyclomatic_complexity FLOAT,
    cognitive_complexity FLOAT,
    lines_of_code INTEGER,
    function_count INTEGER
);
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


def create_job(repo_url: str) -> int:
    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO analysis_jobs (repo_url, status) VALUES (%s, %s) RETURNING id",
            (repo_url, "pending"),
        )
        return cur.fetchone()[0]


def update_job_status(job_id: int, status: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE analysis_jobs SET status = %s WHERE id = %s",
            (status, job_id),
        )


def insert_module_metrics(job_id: int, metrics: list[dict[str, Any]]) -> None:
    if not metrics:
        return
    with get_cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO module_metrics
                (job_id, file_path, cyclomatic_complexity, cognitive_complexity,
                 lines_of_code, function_count)
            VALUES (%(job_id)s, %(file_path)s, %(cyclomatic_complexity)s,
                    %(cognitive_complexity)s, %(lines_of_code)s, %(function_count)s)
            """,
            [{**m, "job_id": job_id} for m in metrics],
        )


def get_job(job_id: int) -> dict[str, Any] | None:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            "SELECT id, repo_url, created_at, status FROM analysis_jobs WHERE id = %s",
            (job_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_job_modules(job_id: int) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT file_path, cyclomatic_complexity, cognitive_complexity,
                   lines_of_code, function_count
            FROM module_metrics
            WHERE job_id = %s
            ORDER BY cyclomatic_complexity DESC
            """,
            (job_id,),
        )
        return [dict(row) for row in cur.fetchall()]


def get_all_modules() -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT m.file_path, m.cyclomatic_complexity, m.cognitive_complexity,
                   m.lines_of_code, m.function_count, j.repo_url, j.id AS job_id
            FROM module_metrics m
            JOIN analysis_jobs j ON j.id = m.job_id
            ORDER BY m.cyclomatic_complexity DESC
            """
        )
        return [dict(row) for row in cur.fetchall()]
