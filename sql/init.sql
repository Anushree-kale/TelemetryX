CREATE DATABASE telemetryx;

\c telemetryx

CREATE TABLE analysis_jobs (
    id SERIAL PRIMARY KEY,
    repo_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    status TEXT DEFAULT 'pending',
    error_detail TEXT,
    progress_pct INTEGER DEFAULT 0,
    progress_message TEXT DEFAULT ''
);

CREATE TABLE module_metrics (
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

CREATE TABLE shap_explanations (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES module_metrics(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    shap_value FLOAT,
    contribution_pct FLOAT,
    display_value TEXT
);
