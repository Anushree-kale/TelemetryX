"""
Train failure_model.pth from all module_metrics already stored in PostgreSQL.

Usage (from backend/ with venv active):
    python train_failure_model.py
"""

import database
from failure_predictor import train_failure_model

def main() -> None:
    database.init_schema()
    
    with database.get_cursor() as cur:
        cur.execute("SELECT MAX(id) FROM analysis_jobs WHERE status = 'complete'")
        row = cur.fetchone()
        max_job_id = row[0] if row and row[0] else None

    if not max_job_id:
        print("No completed jobs found. Run an analysis first.")
        return

    with database.get_cursor() as cur:
        cur.execute("SELECT DISTINCT file_path FROM module_metrics")
        file_paths = [r[0] for r in cur.fetchall()]

    if not file_paths:
        print("No files found. Run an analysis first.")
        return
        
    print(f"Fetching history for {len(file_paths)} files up to job {max_job_id}...")
    history_by_file = database.get_bulk_file_metric_history(file_paths, max_job_id)
    
    usable_files = {p: h for p, h in history_by_file.items() if len(h) >= 3}
    print(f"Found {len(usable_files)} files with sequence length >= 3 for training.")
    
    if not usable_files:
        print("Need at least 1 file with 3+ history points. Run more analyses first.")
        return
        
    train_failure_model(usable_files)

if __name__ == "__main__":
    main()
