from pathlib import Path
from typing import Any

import joblib
import numpy as np
from xgboost import XGBClassifier

MODEL_PATH = Path(__file__).resolve().parent / "debt_model.pkl"

FEATURE_COLUMNS = [
    "cyclomatic_complexity",
    "cognitive_complexity",
    "churn_90d",
    "test_coverage_ratio",
    "lines_of_code",
    "function_count",
    "max_fn_complexity",
    "fan_out",
]

FEATURE_LABELS = {
    "cyclomatic_complexity": "Cyclomatic complexity",
    "cognitive_complexity": "Cognitive complexity",
    "churn_90d": "Churn rate (90d)",
    "test_coverage_ratio": "Test file ratio",
    "lines_of_code": "Lines of code",
    "function_count": "Function count",
    "max_fn_complexity": "Max function complexity",
    "fan_out": "Dependency fan-out",
}


def synthetic_label(row: dict[str, Any]) -> int:
    """Heuristic training label — not real incident/bug data.

    XGBoost currently re-learns this rule; replace with labeled outcomes
    before presenting the debt score as ML-driven.
    """
    if (
        float(row.get("cyclomatic_complexity", 0)) > 15
        and int(row.get("churn_90d", 0)) > 10
        and float(row.get("test_coverage_ratio", 0)) < 0.2
    ):
        return 1
    return 0


def risk_level(debt_score: float) -> str:
    if debt_score > 70:
        return "high"
    if debt_score >= 40:
        return "medium"
    return "low"


def estimate_roi_days(row: dict[str, Any]) -> float:
    cc = float(row.get("cyclomatic_complexity", 0))
    churn = int(row.get("churn_90d", 0))
    return round(max(0.0, (cc - 5) * 0.5 + churn * 0.1), 2)


def _feature_matrix(rows: list[dict[str, Any]]) -> np.ndarray:
    return np.array(
        [[float(row.get(col, 0) or 0) for col in FEATURE_COLUMNS] for row in rows],
        dtype=np.float32,
    )


class DebtScorer:
    def __init__(self) -> None:
        self.model: XGBClassifier | None = None

    def load(self) -> bool:
        if MODEL_PATH.exists():
            self.model = joblib.load(MODEL_PATH)
            return True
        return False

    def save(self) -> None:
        if self.model is not None:
            joblib.dump(self.model, MODEL_PATH)

    def train(self, rows: list[dict[str, Any]]) -> None:
        if len(rows) < 3:
            self.model = None
            return

        X = _feature_matrix(rows)
        y = np.array([synthetic_label(r) for r in rows], dtype=np.int32)

        if len(np.unique(y)) < 2:
            y[0] = 1 - y[0]

        n_pos = int(np.sum(y == 1))
        n_neg = int(np.sum(y == 0))
        scale_pos_weight = float(n_neg) / float(n_pos) if n_pos > 0 else 1.0

        self.model = XGBClassifier(
            n_estimators=150,
            max_depth=6,
            eval_metric="logloss",
            random_state=42,
            scale_pos_weight=scale_pos_weight,
        )
        self.model.fit(X, y)
        self.save()

    def predict_batch(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not rows:
            return rows

        if self.model is None:
            self.train(rows)

        if self.model is None:
            for row in rows:
                row["debt_score"] = 50.0
                row["roi_days"] = estimate_roi_days(row)
                row["risk_level"] = risk_level(50.0)
            return rows

        X = _feature_matrix(rows)
        probs = self.model.predict_proba(X)[:, 1]
        enriched: list[dict[str, Any]] = []
        for row, prob in zip(rows, probs):
            score = round(float(prob) * 100, 2)
            out = {**row, "debt_score": score, "roi_days": estimate_roi_days(row)}
            out["risk_level"] = risk_level(score)
            enriched.append(out)
        return enriched


_scorer = DebtScorer()


def get_scorer() -> DebtScorer:
    return _scorer
