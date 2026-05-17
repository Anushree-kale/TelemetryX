"""
Train debt_model.pkl from all module_metrics already stored in PostgreSQL.

Usage (from backend/ with venv active):
    python train_debt_model.py
"""

import database
from debt_model import MODEL_PATH, get_scorer


def main() -> None:
    database.init_schema()
    rows = database.get_all_metrics_for_training()
    if len(rows) < 3:
        print(f"Need at least 3 modules; found {len(rows)}. Run an analysis first.")
        return

    scorer = get_scorer()
    scorer.train(rows)
    print(f"Trained on {len(rows)} modules → {MODEL_PATH}")


if __name__ == "__main__":
    main()
