#!/usr/bin/env python3
"""Train the LSTM failure predictor from module_metrics history in PostgreSQL."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import database
from failure_predictor import MODEL_PATH, train_failure_model_from_db


def main() -> None:
    database.init_schema()
    count = train_failure_model_from_db(min_steps=3)
    if count == 0:
        print(
            "No file sequences with 3+ completed job snapshots found.\n"
            "Run 3–4 repo scans first (same or different repos), then retry."
        )
        sys.exit(1)
    print(f"Saved weights to {MODEL_PATH}")


if __name__ == "__main__":
    main()
