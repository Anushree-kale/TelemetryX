import os
import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool
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
    progress_message TEXT DEFAULT '',
    privacy_mode BOOLEAN DEFAULT FALSE
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
    risk_level TEXT,
    imports TEXT DEFAULT '',
    commit_timestamps TEXT DEFAULT '',
    unique_author_count INTEGER DEFAULT 0,
    top_author_pct FLOAT DEFAULT 0,
    bug_fix_ratio FLOAT DEFAULT 0,
    days_since_last_commit INTEGER DEFAULT 0,
    co_changes TEXT DEFAULT '',
    in_degree INTEGER DEFAULT 0,
    out_degree INTEGER DEFAULT 0,
    betweenness FLOAT DEFAULT 0,
    cluster_id INTEGER DEFAULT 0,
    downstream_count INTEGER DEFAULT 0,
    is_critical BOOLEAN DEFAULT FALSE,
    priority_score FLOAT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS co_change_pairs (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    file_a TEXT NOT NULL,
    file_b TEXT NOT NULL,
    co_change_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dependency_graphs (
    id SERIAL PRIMARY KEY,
    job_id INTEGER UNIQUE REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    graph_json JSONB NOT NULL,
    node_count INTEGER DEFAULT 0,
    edge_count INTEGER DEFAULT 0,
    cluster_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS roadmap_items (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    module_id INTEGER REFERENCES module_metrics(id) ON DELETE CASCADE,
    priority_score FLOAT,
    confidence_margin FLOAT,
    cascade_benefit FLOAT,
    downstream_files TEXT[],
    fix_hours FLOAT,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS shap_explanations (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES module_metrics(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    shap_value FLOAT,
    contribution_pct FLOAT,
    display_value TEXT
);

CREATE TABLE IF NOT EXISTS failure_predictions (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    module_id INTEGER REFERENCES module_metrics(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    risk_score FLOAT NOT NULL,
    risk_level TEXT NOT NULL,
    predicted_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    team TEXT NOT NULL DEFAULT 'default',
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    rate_limit_per_hour INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP
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
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS imports TEXT DEFAULT '';
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS commit_timestamps TEXT DEFAULT '';
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS unique_author_count INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS top_author_pct FLOAT DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS bug_fix_ratio FLOAT DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS days_since_last_commit INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS co_changes TEXT DEFAULT '';
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS in_degree INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS out_degree INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS betweenness FLOAT DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS cluster_id INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS downstream_count INTEGER DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS priority_score FLOAT DEFAULT 0;
ALTER TABLE module_metrics ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'unknown';
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS privacy_mode BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS failure_predictions (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    module_id INTEGER REFERENCES module_metrics(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    risk_score FLOAT NOT NULL,
    risk_level TEXT NOT NULL,
    predicted_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    team TEXT NOT NULL DEFAULT 'default',
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    rate_limit_per_hour INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP
);
"""


_pool = None


def get_pool():
    global _pool
    if _pool is None:
        minconn = int(os.getenv("DB_POOL_MIN", "2"))
        maxconn = int(os.getenv("DB_POOL_MAX", "20"))
        _pool = ThreadedConnectionPool(minconn, maxconn, DATABASE_URL)
    return _pool


def get_connection():
    return get_pool().getconn()


def put_connection(conn):
    get_pool().putconn(conn)


@contextmanager
def get_cursor(dict_cursor: bool = False):
    pool = get_pool()
    conn = pool.getconn()
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
        pool.putconn(conn)


def init_schema() -> None:
    with get_cursor() as cur:
        cur.execute(SCHEMA_SQL)
        for stmt in MIGRATION_SQL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)


def create_job(repo_url: str, privacy_mode: bool = False) -> int:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO analysis_jobs (repo_url, status, progress_pct, progress_message, privacy_mode)
            VALUES (%s, %s, 0, %s, %s) RETURNING id
            """,
            (repo_url, "pending", "Queued", privacy_mode),
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
                    job_id, file_path, language, cyclomatic_complexity, cognitive_complexity,
                    lines_of_code, function_count, churn_90d, test_coverage_ratio,
                    max_fn_complexity, fan_out, debt_score, roi_days, risk_level, imports,
                    commit_timestamps, unique_author_count, top_author_pct,
                    bug_fix_ratio, days_since_last_commit, co_changes
                ) VALUES (
                    %(job_id)s, %(file_path)s, %(language)s, %(cyclomatic_complexity)s,
                    %(cognitive_complexity)s, %(lines_of_code)s, %(function_count)s,
                    %(churn_90d)s, %(test_coverage_ratio)s, %(max_fn_complexity)s,
                    %(fan_out)s, %(debt_score)s, %(roi_days)s, %(risk_level)s, %(imports)s,
                    %(commit_timestamps)s, %(unique_author_count)s, %(top_author_pct)s,
                    %(bug_fix_ratio)s, %(days_since_last_commit)s, %(co_changes)s
                ) RETURNING id
                """,
                {
                    **m,
                    "job_id": job_id,
                    "language": m.get("language", "unknown"),
                    "imports": m.get("imports", ""),
                    "commit_timestamps": json.dumps(m.get("commit_timestamps", [])),
                    "unique_author_count": int(m.get("unique_author_count", 0)),
                    "top_author_pct": float(m.get("top_author_pct", 0.0)),
                    "bug_fix_ratio": float(m.get("bug_fix_ratio", 0.0)),
                    "days_since_last_commit": int(m.get("days_since_last_commit", 0)),
                    "co_changes": json.dumps(m.get("co_changes", {})),
                },
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
                   progress_pct, progress_message, privacy_mode
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
            m["summary"] = ""
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
                "display_value": row["display_value"],
                "shap_value": float(row["shap_value"]),
            }
        )

    from explain import reasons_to_text

    for m in modules:
        reasons_list = by_module.get(m.get("id"), [])[:3]
        m["reasons"] = reasons_list
        m["summary"] = " ".join(reasons_to_text(reasons_list))
    return modules


def _module_shap_summaries(module_ids: list[int]) -> dict[int, str]:
    """Plain-language SHAP narrative per module (top 3 contributors)."""
    if not module_ids:
        return {}
    from explain import reasons_to_text

    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT module_id, feature, shap_value, contribution_pct, display_value
            FROM shap_explanations
            WHERE module_id = ANY(%s)
            ORDER BY module_id, contribution_pct DESC
            """,
            (module_ids,),
        )
        rows = cur.fetchall()

    by_module: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        mid = row["module_id"]
        lst = by_module.setdefault(mid, [])
        if len(lst) >= 3:
            continue
        lst.append(
            {
                "feature": row["feature"],
                "shap_value": float(row["shap_value"]),
                "contribution_pct": float(row["contribution_pct"]),
                "display_value": row["display_value"],
            }
        )

    return {mid: " ".join(reasons_to_text(lst)) for mid, lst in by_module.items()}


_MODULE_COLUMNS = """
    id, job_id, file_path, language, cyclomatic_complexity, cognitive_complexity,
    lines_of_code, function_count, churn_90d, test_coverage_ratio,
    max_fn_complexity, fan_out, debt_score, roi_days, risk_level, imports,
    commit_timestamps, unique_author_count, top_author_pct, bug_fix_ratio,
    days_since_last_commit, co_changes, in_degree, out_degree, betweenness,
    cluster_id, downstream_count, is_critical, priority_score
"""


def _parse_module_row(row: dict[str, Any]) -> dict[str, Any]:
    m = dict(row)
    if m.get("co_changes") and isinstance(m["co_changes"], str):
        try:
            m["co_changes"] = json.loads(m["co_changes"])
        except json.JSONDecodeError:
            m["co_changes"] = {}
    m["is_critical"] = bool(m.get("is_critical"))
    return m


def get_job_modules(job_id: int) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            f"""
            SELECT {_MODULE_COLUMNS}
            FROM module_metrics
            WHERE job_id = %s
            ORDER BY debt_score DESC NULLS LAST
            """,
            (job_id,),
        )
        modules = [_parse_module_row(dict(row)) for row in cur.fetchall()]
    return _attach_reasons(modules)


def get_module_by_id(module_id: int) -> dict[str, Any] | None:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            f"""
            SELECT {_MODULE_COLUMNS}
            FROM module_metrics WHERE id = %s
            """,
            (module_id,),
        )
        row = cur.fetchone()
        return _parse_module_row(dict(row)) if row else None


def insert_co_change_pairs(job_id: int, pairs: list[dict[str, Any]]) -> None:
    if not pairs:
        return
    with get_cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO co_change_pairs (job_id, file_a, file_b, co_change_count)
            VALUES (%(job_id)s, %(file_a)s, %(file_b)s, %(co_change_count)s)
            """,
            [{**p, "job_id": job_id} for p in pairs],
        )


def get_co_change_pairs(job_id: int) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT file_a, file_b, co_change_count
            FROM co_change_pairs WHERE job_id = %s
            ORDER BY co_change_count DESC, file_a, file_b
            """,
            (job_id,),
        )
        return [dict(row) for row in cur.fetchall()]


def get_job_shap_aggregate(job_id: int) -> list[dict[str, Any]]:
    """Repo-wide SHAP: which features drive debt across modules in this job."""
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT se.feature,
                   SUM(ABS(se.shap_value)) AS total_abs_shap,
                   AVG(se.contribution_pct) AS avg_contribution_pct,
                   COUNT(DISTINCT se.module_id) AS module_count
            FROM shap_explanations se
            JOIN module_metrics m ON m.id = se.module_id
            WHERE m.job_id = %s
            GROUP BY se.feature
            ORDER BY total_abs_shap DESC NULLS LAST
            LIMIT 20
            """,
            (job_id,),
        )
        rows = []
        for row in cur.fetchall():
            d = dict(row)
            d["total_abs_shap"] = float(d["total_abs_shap"] or 0)
            d["avg_contribution_pct"] = float(d["avg_contribution_pct"] or 0)
            d["module_count"] = int(d["module_count"] or 0)
            rows.append(d)
        return rows


def update_module_graph_metrics(
    job_id: int, node_metrics: dict[str, dict[str, Any]]
) -> None:
    with get_cursor() as cur:
        for file_path, metrics in node_metrics.items():
            cur.execute(
                """
                UPDATE module_metrics
                SET in_degree = %s, out_degree = %s, betweenness = %s,
                    cluster_id = %s, downstream_count = %s
                WHERE job_id = %s AND file_path = %s
                """,
                (
                    metrics["in_degree"],
                    metrics["out_degree"],
                    metrics["betweenness"],
                    metrics["cluster_id"],
                    metrics["downstream_count"],
                    job_id,
                    file_path,
                ),
            )


def insert_dependency_graph(
    job_id: int,
    graph_json: dict,
    node_count: int,
    edge_count: int,
    cluster_count: int,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO dependency_graphs
                (job_id, graph_json, node_count, edge_count, cluster_count)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (job_id) DO UPDATE SET
                graph_json = EXCLUDED.graph_json,
                node_count = EXCLUDED.node_count,
                edge_count = EXCLUDED.edge_count,
                cluster_count = EXCLUDED.cluster_count
            """,
            (
                job_id,
                json.dumps(graph_json),
                node_count,
                edge_count,
                cluster_count,
            ),
        )


def get_dependency_graph(job_id: int) -> dict[str, Any] | None:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, job_id, graph_json, node_count, edge_count, cluster_count
            FROM dependency_graphs WHERE job_id = %s
            """,
            (job_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        result = dict(row)
        if isinstance(result["graph_json"], str):
            result["graph_json"] = json.loads(result["graph_json"])
        return result


def replace_roadmap_items(job_id: int, items: list[dict[str, Any]]) -> None:
    with get_cursor() as cur:
        cur.execute("DELETE FROM roadmap_items WHERE job_id = %s", (job_id,))
        for item in items:
            cur.execute(
                """
                UPDATE module_metrics
                SET priority_score = %s
                WHERE id = %s
                """,
                (item["priority_score"], item["module_id"]),
            )
            cur.execute(
                """
                INSERT INTO roadmap_items (
                    job_id, rank, module_id, priority_score, confidence_margin,
                    cascade_benefit, downstream_files, fix_hours, reason
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    job_id,
                    item["rank"],
                    item["module_id"],
                    item["priority_score"],
                    item["confidence_margin"],
                    item["cascade_benefit"],
                    item["downstream_files"],
                    item["fix_hours"],
                    item["reason"],
                ),
            )


def get_roadmap_items(job_id: int) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT r.rank, r.priority_score, r.confidence_margin, r.cascade_benefit,
                   r.downstream_files, r.fix_hours, r.reason,
                   m.id AS module_id, m.file_path, m.debt_score, m.downstream_count,
                   m.is_critical, m.roi_days, m.bug_fix_ratio, m.cluster_id,
                   m.in_degree, m.out_degree, m.priority_score
            FROM roadmap_items r
            JOIN module_metrics m ON m.id = r.module_id
            WHERE r.job_id = %s
            ORDER BY r.rank ASC
            """,
            (job_id,),
        )
        items = [dict(row) for row in cur.fetchall()]
    if not items:
        return items
    summaries = _module_shap_summaries([i["module_id"] for i in items])
    for item in items:
        item["summary"] = summaries.get(item["module_id"], "")
    return items


def set_module_critical(module_id: int, is_critical: bool) -> dict[str, Any] | None:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            UPDATE module_metrics SET is_critical = %s WHERE id = %s
            RETURNING job_id
            """,
            (is_critical, module_id),
        )
        row = cur.fetchone()
        return {"job_id": row["job_id"]} if row else None


def get_all_modules() -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT
                m.id, m.file_path, m.language, m.cyclomatic_complexity, m.cognitive_complexity,
                m.lines_of_code, m.function_count, m.churn_90d,
                m.test_coverage_ratio, m.max_fn_complexity, m.fan_out,
                m.debt_score, m.roi_days, m.risk_level, m.imports,
                m.commit_timestamps, m.unique_author_count, m.top_author_pct, m.bug_fix_ratio,
                m.days_since_last_commit, m.co_changes, m.in_degree, m.out_degree, m.betweenness,
                m.cluster_id, m.downstream_count, m.is_critical, m.priority_score,
                j.repo_url, j.id AS job_id
            FROM module_metrics m
            JOIN analysis_jobs j ON j.id = m.job_id
            ORDER BY m.debt_score DESC NULLS LAST
            """
        )
        modules = [_parse_module_row(dict(row)) for row in cur.fetchall()]
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


def get_repo_jobs_history(repo_url: str) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT j.id, j.created_at, j.privacy_mode,
                   COALESCE(AVG(m.debt_score), 0) AS avg_debt_score,
                   COALESCE(SUM(m.lines_of_code), 0) AS total_loc,
                   COALESCE(SUM(CASE WHEN m.risk_level = 'high' THEN 1 ELSE 0 END), 0) AS high_risk_count,
                   COALESCE(AVG(m.test_coverage_ratio), 0) AS avg_test_coverage,
                   COUNT(m.id) AS file_count,
                   COALESCE((SELECT AVG(risk_score) FROM failure_predictions WHERE job_id = j.id), 0) AS avg_failure_risk,
                   COALESCE(SUM(CASE WHEN m.risk_level = 'high' THEN m.roi_days ELSE 0 END), 0) AS high_risk_roi
            FROM analysis_jobs j
            LEFT JOIN module_metrics m ON m.job_id = j.id
            WHERE j.repo_url = %s AND j.status = 'complete'
            GROUP BY j.id, j.created_at, j.privacy_mode
            ORDER BY j.created_at ASC
            """,
            (repo_url,),
        )
        rows = cur.fetchall()

    result = []
    for r in rows:
        row_dict = dict(r)
        if row_dict["created_at"]:
            row_dict["created_at"] = row_dict["created_at"].isoformat()
        row_dict["avg_debt_score"] = float(row_dict["avg_debt_score"])
        row_dict["total_loc"] = int(row_dict["total_loc"])
        row_dict["high_risk_count"] = int(row_dict["high_risk_count"])
        row_dict["avg_test_coverage"] = float(row_dict["avg_test_coverage"])
        row_dict["file_count"] = int(row_dict["file_count"])
        row_dict["avg_failure_risk"] = float(row_dict["avg_failure_risk"])
        row_dict["high_risk_roi"] = float(row_dict["high_risk_roi"])
        row_dict["privacy_mode"] = bool(row_dict["privacy_mode"])
        result.append(row_dict)
    return result


def get_repo_urls_list() -> list[str]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT repo_url 
            FROM analysis_jobs 
            WHERE status = 'complete'
            ORDER BY repo_url ASC
            """
        )
        return [r[0] for r in cur.fetchall()]


def get_last_completed_job_for_repo(repo_url: str) -> dict[str, Any] | None:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, repo_url, created_at, status
            FROM analysis_jobs
            WHERE repo_url = %s AND status = 'complete'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (repo_url,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_active_job_for_repo(repo_url: str) -> dict[str, Any] | None:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, status, progress_pct, progress_message 
            FROM analysis_jobs
            WHERE repo_url = %s AND status IN ('pending', 'running')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (repo_url,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def insert_failure_predictions(
    job_id: int,
    predictions: list[dict[str, Any]],
) -> None:
    if not predictions:
        return
    with get_cursor() as cur:
        cur.execute("DELETE FROM failure_predictions WHERE job_id = %s", (job_id,))
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO failure_predictions
                (job_id, module_id, file_path, risk_score, risk_level)
            VALUES (%(job_id)s, %(module_id)s, %(file_path)s, %(risk_score)s, %(risk_level)s)
            """,
            [{**p, "job_id": job_id} for p in predictions],
        )


def get_job_failure_predictions(job_id: int) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, job_id, module_id, file_path, risk_score, risk_level, predicted_at
            FROM failure_predictions
            WHERE job_id = %s
            ORDER BY risk_score DESC
            """,
            (job_id,),
        )
        return [dict(row) for row in cur.fetchall()]


def get_file_metric_history(file_path: str, current_job_id: int) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT mm.churn_90d, mm.cyclomatic_complexity, mm.days_since_last_commit
            FROM module_metrics mm
            JOIN analysis_jobs aj ON mm.job_id = aj.id
            WHERE mm.file_path = %s 
              AND aj.status = 'complete' 
              AND aj.id <= %s
            ORDER BY aj.created_at ASC
            LIMIT 10
            """,
            (file_path, current_job_id),
        )
        return [dict(row) for row in cur.fetchall()]


def get_historical_metric_sequences(min_steps: int = 3) -> dict[str, list[dict[str, Any]]]:
    """Build per-file metric timelines from all completed jobs (for LSTM training)."""
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT mm.file_path, mm.churn_90d, mm.cyclomatic_complexity,
                   mm.days_since_last_commit, aj.created_at
            FROM module_metrics mm
            JOIN analysis_jobs aj ON mm.job_id = aj.id
            WHERE aj.status = 'complete'
            ORDER BY mm.file_path, aj.created_at ASC
            """
        )
        rows = cur.fetchall()

    sequences: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        path = row["file_path"]
        sequences.setdefault(path, []).append(
            {
                "churn_90d": row["churn_90d"],
                "cyclomatic_complexity": row["cyclomatic_complexity"],
                "days_since_last_commit": row["days_since_last_commit"],
            }
        )

    return {
        path: history
        for path, history in sequences.items()
        if len(history) >= min_steps
    }


def get_bulk_file_metric_history(file_paths: list[str], current_job_id: int) -> dict[str, list[dict[str, Any]]]:
    if not file_paths:
        return {}
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            WITH ranked_history AS (
                SELECT mm.file_path, mm.churn_90d, mm.cyclomatic_complexity, mm.days_since_last_commit,
                       ROW_NUMBER() OVER (PARTITION BY mm.file_path ORDER BY aj.created_at DESC) as rk
                FROM module_metrics mm
                JOIN analysis_jobs aj ON mm.job_id = aj.id
                WHERE mm.file_path = ANY(%s) 
                  AND aj.status = 'complete' 
                  AND aj.id <= %s
            )
            SELECT file_path, churn_90d, cyclomatic_complexity, days_since_last_commit
            FROM ranked_history
            WHERE rk <= 10
            ORDER BY rk DESC
            """,
            (file_paths, current_job_id),
        )
        rows = cur.fetchall()
        
        # Group by file_path
        history_by_file = {path: [] for path in file_paths}
        for row in rows:
            path = row["file_path"]
            if path in history_by_file:
                history_by_file[path].append({
                    "churn_90d": row["churn_90d"],
                    "cyclomatic_complexity": row["cyclomatic_complexity"],
                    "days_since_last_commit": row["days_since_last_commit"]
                })
        return history_by_file


def get_job_modules_raw(job_id: int) -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, file_path, churn_90d, cyclomatic_complexity, days_since_last_commit
            FROM module_metrics
            WHERE job_id = %s
            """,
            (job_id,),
        )
        return [dict(row) for row in cur.fetchall()]


def create_api_key_record(
    *,
    name: str,
    team: str,
    key_hash: str,
    key_prefix: str,
    rate_limit_per_hour: int,
) -> dict[str, Any]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            INSERT INTO api_keys (name, team, key_hash, key_prefix, rate_limit_per_hour)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, name, team, key_prefix, rate_limit_per_hour, created_at
            """,
            (name, team, key_hash, key_prefix, rate_limit_per_hour),
        )
        row = dict(cur.fetchone())
        if row["created_at"]:
            row["created_at"] = row["created_at"].isoformat()
        return row


def list_api_keys() -> list[dict[str, Any]]:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, name, team, key_prefix, rate_limit_per_hour, created_at, revoked_at
            FROM api_keys
            ORDER BY created_at DESC
            """
        )
        rows = []
        for row in cur.fetchall():
            item = dict(row)
            if item["created_at"]:
                item["created_at"] = item["created_at"].isoformat()
            if item["revoked_at"]:
                item["revoked_at"] = item["revoked_at"].isoformat()
            rows.append(item)
        return rows


def get_active_api_key_by_hash(key_hash: str) -> dict[str, Any] | None:
    with get_cursor(dict_cursor=True) as cur:
        cur.execute(
            """
            SELECT id, name, team, key_hash, key_prefix, rate_limit_per_hour, created_at
            FROM api_keys
            WHERE key_hash = %s AND revoked_at IS NULL
            """,
            (key_hash,),
        )
        row = cur.fetchone()
        if not row:
            return None
        item = dict(row)
        if item["created_at"]:
            item["created_at"] = item["created_at"].isoformat()
        return item


def revoke_api_key(key_id: int) -> bool:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE api_keys
            SET revoked_at = NOW()
            WHERE id = %s AND revoked_at IS NULL
            """,
            (key_id,),
        )
        return cur.rowcount > 0


