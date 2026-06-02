import csv
import os
import logging
import json
from typing import Any

import numpy as np
import xgboost as xgb
import shap
import joblib
from sklearn.metrics import accuracy_score, roc_auc_score

import database

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "top_author_pct",
    "bug_fix_ratio",
    "days_since_last_commit",
    "unique_author_count",
]

FEATURE_LABELS = {
    "top_author_pct": "Concentration Risk",
    "bug_fix_ratio": "Firefighting Ratio",
    "days_since_last_commit": "Activity Gap Pressure",
    "unique_author_count": "Key Person Dependency",
}

LABEL_COLUMN = "high_risk"
MIN_LABELED_ROWS_TO_TRAIN = 30
MIN_LABELED_ROWS_TO_VALIDATE = 5

MODEL_PATH = os.path.join(os.path.dirname(__file__), "burnout_model.pkl")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DEFAULT_VALIDATION_PATH = os.path.join(DATA_DIR, "burnout_validation.csv")


def validation_dataset_path() -> str:
    return os.getenv("BURNOUT_VALIDATION_PATH", DEFAULT_VALIDATION_PATH)


def load_labeled_cohort_rows() -> list[dict[str, float]] | None:
    path = validation_dataset_path()
    if not os.path.isfile(path):
        return None

    rows: list[dict[str, float]] = []
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            return None
        missing = set(FEATURE_COLUMNS + [LABEL_COLUMN]) - set(reader.fieldnames)
        if missing:
            logger.warning(
                "Burnout validation CSV at %s is missing columns: %s",
                path,
                sorted(missing),
            )
            return None
        for raw in reader:
            try:
                rows.append(
                    {
                        col: float(raw[col])
                        for col in FEATURE_COLUMNS + [LABEL_COLUMN]
                    }
                )
            except (KeyError, TypeError, ValueError):
                continue
    return rows or None


def _feature_matrix(rows: list[dict[str, float]]) -> np.ndarray:
    return np.array(
        [[float(row[col]) for col in FEATURE_COLUMNS] for row in rows],
        dtype=np.float32,
    )


def _labels(rows: list[dict[str, float]]) -> np.ndarray:
    return np.array([int(round(float(row[LABEL_COLUMN]))) for row in rows], dtype=np.int32)


def evaluate_on_validation(clf: xgb.XGBClassifier) -> dict[str, Any] | None:
    rows = load_labeled_cohort_rows()
    if not rows or len(rows) < MIN_LABELED_ROWS_TO_VALIDATE:
        return None

    y = _labels(rows)
    if len(np.unique(y)) < 2:
        return None

    X = _feature_matrix(rows)
    probs = clf.predict_proba(X)[:, 1]
    preds = (probs >= 0.5).astype(int)
    metrics: dict[str, Any] = {
        "n_samples": len(rows),
        "accuracy": round(float(accuracy_score(y, preds)), 4),
        "dataset_path": validation_dataset_path(),
    }
    try:
        metrics["roc_auc"] = round(float(roc_auc_score(y, probs)), 4)
    except ValueError:
        pass
    return metrics


def get_model_provenance(clf: xgb.XGBClassifier | None = None) -> dict[str, Any]:
    labeled = load_labeled_cohort_rows()
    labeled_count = len(labeled) if labeled else 0
    model = clf if clf is not None else get_burnout_model()
    training_source = _read_training_source()
    validation_metrics = evaluate_on_validation(model)

    return {
        "training_source": training_source,
        "validation_dataset_present": labeled_count >= MIN_LABELED_ROWS_TO_VALIDATE,
        "validation_row_count": labeled_count,
        "validation_metrics": validation_metrics,
        "validation_dataset_hint": (
            "Place anonymized labeled cohort rows at backend/data/burnout_validation.csv "
            "(see burnout_validation.csv.example). Override path with BURNOUT_VALIDATION_PATH."
        ),
    }


def _read_training_source() -> str:
    meta_path = MODEL_PATH + ".meta.json"
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, encoding="utf-8") as handle:
                meta = json.load(handle)
            return str(meta.get("training_source", "synthetic"))
        except (json.JSONDecodeError, OSError):
            pass
    return "synthetic"


def _write_training_source(source: str) -> None:
    meta_path = MODEL_PATH + ".meta.json"
    with open(meta_path, "w", encoding="utf-8") as handle:
        json.dump({"training_source": source}, handle)


def _train_classifier(X: np.ndarray, y: np.ndarray) -> xgb.XGBClassifier:
    if len(np.unique(y)) < 2:
        y = y.copy()
        y[0] = 1 - y[0]

    clf = xgb.XGBClassifier(
        n_estimators=60,
        max_depth=3,
        learning_rate=0.15,
        random_state=42,
        eval_metric="logloss",
    )
    clf.fit(X, y)
    return clf


def train_burnout_model_synthetic() -> xgb.XGBClassifier:
    """Generates synthetic cohort-level training dataset and trains the XGBoost model."""
    logger.info("Generating synthetic training data for burnout model...")
    np.random.seed(42)
    n_samples = 1200

    top_author_pct = np.random.uniform(0.1, 1.0, n_samples)
    bug_fix_ratio = np.random.uniform(0.0, 1.0, n_samples)
    days_since_last_commit = np.random.uniform(0.0, 90.0, n_samples)
    unique_author_count = np.random.randint(1, 20, n_samples).astype(float)

    c_risk = top_author_pct
    f_risk = bug_fix_ratio
    a_risk = 1.0 - (days_since_last_commit / 90.0)
    s_risk = 1.0 - np.minimum(unique_author_count / 10.0, 1.0)

    base_score = 0.4 * c_risk + 0.3 * f_risk + 0.2 * a_risk + 0.1 * s_risk
    noise = np.random.normal(0, 0.05, n_samples)
    final_score = base_score + noise

    y = (final_score > 0.45).astype(int)
    X = np.stack(
        [top_author_pct, bug_fix_ratio, days_since_last_commit, unique_author_count],
        axis=1,
    )

    clf = _train_classifier(X, y)
    _write_training_source("synthetic")
    logger.info("Saving synthetic-trained burnout model to %s", MODEL_PATH)
    joblib.dump(clf, MODEL_PATH)
    return clf


def train_burnout_model_from_labeled(rows: list[dict[str, float]]) -> xgb.XGBClassifier:
    logger.info("Training burnout model on %d labeled cohort rows", len(rows))
    X = _feature_matrix(rows)
    y = _labels(rows)
    clf = _train_classifier(X, y)
    _write_training_source("labeled_validation")
    joblib.dump(clf, MODEL_PATH)
    return clf


def retrain_burnout_model() -> tuple[xgb.XGBClassifier, dict[str, Any]]:
    labeled = load_labeled_cohort_rows()
    if labeled and len(labeled) >= MIN_LABELED_ROWS_TO_TRAIN:
        clf = train_burnout_model_from_labeled(labeled)
    else:
        clf = train_burnout_model_synthetic()
    return clf, get_model_provenance(clf)


def train_burnout_model() -> xgb.XGBClassifier:
    labeled = load_labeled_cohort_rows()
    if labeled and len(labeled) >= MIN_LABELED_ROWS_TO_TRAIN:
        return train_burnout_model_from_labeled(labeled)
    return train_burnout_model_synthetic()


def get_burnout_model() -> xgb.XGBClassifier:
    """Returns the loaded XGBoost model, training it first if the file is missing."""
    if not os.path.exists(MODEL_PATH):
        return train_burnout_model()
    try:
        return joblib.load(MODEL_PATH)
    except Exception as e:
        logger.warning("Failed to load burnout model: %s. Retraining...", e)
        return train_burnout_model()


def predict_burnout(job_id: int) -> dict[str, Any]:
    """Retrieves cohort-level metrics for a job, predicts burnout risk using XGBoost,

    extracts top 2 drivers via SHAP TreeExplainer, and saves the assessment to the DB.
    """
    metrics = database.get_burnout_cohort_metrics(job_id)
    clf = get_burnout_model()

    x_input = np.array(
        [
            [
                metrics["top_author_pct"],
                metrics["bug_fix_ratio"],
                metrics["days_since_last_commit"],
                metrics["unique_author_count"],
            ]
        ],
        dtype=np.float32,
    )

    prob = float(clf.predict_proba(x_input)[0][1])

    if prob >= 0.70:
        risk_level = "High"
    elif prob >= 0.35:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    explainer = shap.TreeExplainer(clf)
    sv = explainer.shap_values(x_input)

    if isinstance(sv, list):
        sv_row = sv[1][0] if len(sv) > 1 else sv[0][0]
    else:
        if len(sv.shape) == 3:
            sv_row = sv[1][0] if sv.shape[0] > 1 else sv[0][0]
        elif len(sv.shape) == 2:
            sv_row = sv[0]
        else:
            sv_row = sv

    drivers = []
    for idx, feature_name in enumerate(FEATURE_COLUMNS):
        shap_val = float(sv_row[idx])
        val = metrics[feature_name]

        if feature_name == "top_author_pct" or feature_name == "bug_fix_ratio":
            display_val = f"{val * 100:.1f}%"
        elif feature_name == "days_since_last_commit":
            display_val = f"{val:.1f} days"
        else:
            display_val = f"{int(round(val))}"

        drivers.append(
            {
                "feature": feature_name,
                "label": FEATURE_LABELS[feature_name],
                "shap_value": shap_val,
                "display_value": display_val,
            }
        )

    drivers.sort(key=lambda d: d["shap_value"], reverse=True)
    top_drivers = drivers[:2]

    database.insert_burnout_assessment(
        job_id=job_id,
        risk_level=risk_level,
        risk_score=prob,
        top_drivers=top_drivers,
        metrics=metrics,
    )

    logger.info(
        "Burnout assessment saved for job %s: Risk=%s (%.2f), Top Drivers=%s",
        job_id,
        risk_level,
        prob,
        [d["feature"] for d in top_drivers],
    )

    return {
        "job_id": job_id,
        "risk_level": risk_level,
        "risk_score": prob,
        "top_drivers": top_drivers,
        "metrics": metrics,
        "model_info": get_model_provenance(clf),
    }
