import os
import logging
import json
from typing import Any

import numpy as np
import xgboost as xgb
import shap
import joblib

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

MODEL_PATH = os.path.join(os.path.dirname(__file__), "burnout_model.pkl")


def train_burnout_model() -> xgb.XGBClassifier:
    """Generates synthetic cohort-level training dataset and trains the XGBoost model."""
    logger.info("Generating synthetic training data for burnout model...")
    np.random.seed(42)
    n_samples = 1200

    top_author_pct = np.random.uniform(0.1, 1.0, n_samples)
    bug_fix_ratio = np.random.uniform(0.0, 1.0, n_samples)
    days_since_last_commit = np.random.uniform(0.0, 90.0, n_samples)
    unique_author_count = np.random.randint(1, 20, n_samples).astype(float)

    # Heuristic scoring to establish relationship
    c_risk = top_author_pct
    f_risk = bug_fix_ratio
    a_risk = 1.0 - (days_since_last_commit / 90.0)
    s_risk = 1.0 - np.minimum(unique_author_count / 10.0, 1.0)

    base_score = 0.4 * c_risk + 0.3 * f_risk + 0.2 * a_risk + 0.1 * s_risk
    noise = np.random.normal(0, 0.05, n_samples)
    final_score = base_score + noise

    # Binary target representing high risk of burnout
    y = (final_score > 0.45).astype(int)
    X = np.stack(
        [top_author_pct, bug_fix_ratio, days_since_last_commit, unique_author_count],
        axis=1,
    )

    clf = xgb.XGBClassifier(
        n_estimators=60,
        max_depth=3,
        learning_rate=0.15,
        random_state=42,
        eval_metric="logloss",
    )
    clf.fit(X, y)

    logger.info(f"Saving trained burnout model to {MODEL_PATH}")
    joblib.dump(clf, MODEL_PATH)
    return clf


def get_burnout_model() -> xgb.XGBClassifier:
    """Returns the loaded XGBoost model, training it first if the file is missing."""
    if not os.path.exists(MODEL_PATH):
        return train_burnout_model()
    try:
        return joblib.load(MODEL_PATH)
    except Exception as e:
        logger.warning(f"Failed to load burnout model: {e}. Retraining...")
        return train_burnout_model()


def predict_burnout(job_id: int) -> dict[str, Any]:
    """Retrieves cohort-level metrics for a job, predicts burnout risk using XGBoost,

    extracts top 2 drivers via SHAP TreeExplainer, and saves the assessment to the DB.
    """
    metrics = database.get_burnout_cohort_metrics(job_id)
    clf = get_burnout_model()

    # Form feature vector in specific column order
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

    # 1. Prediction Probability
    prob = float(clf.predict_proba(x_input)[0][1])

    # 2. Risk classification
    if prob >= 0.70:
        risk_level = "High"
    elif prob >= 0.35:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    # 3. Driver analysis using SHAP TreeExplainer
    explainer = shap.TreeExplainer(clf)
    sv = explainer.shap_values(x_input)

    # Handle various SHAP return shapes
    if isinstance(sv, list):
        # Multi-class or list of classes output, take class 1
        sv_row = sv[1][0] if len(sv) > 1 else sv[0][0]
    else:
        if len(sv.shape) == 3:
            # Shape is (n_classes, n_samples, n_features), take class 1, sample 0
            sv_row = sv[1][0] if sv.shape[0] > 1 else sv[0][0]
        elif len(sv.shape) == 2:
            # Shape is (n_samples, n_features)
            sv_row = sv[0]
        else:
            sv_row = sv

    # Generate contributions list
    drivers = []
    for idx, feature_name in enumerate(FEATURE_COLUMNS):
        shap_val = float(sv_row[idx])
        val = metrics[feature_name]
        
        # Display format helper
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

    # Sort descending to get the features most contributing to high risk
    drivers.sort(key=lambda d: d["shap_value"], reverse=True)
    top_drivers = drivers[:2]

    # Save results to DB
    database.insert_burnout_assessment(
        job_id=job_id,
        risk_level=risk_level,
        risk_score=prob,
        top_drivers=top_drivers,
        metrics=metrics,
    )

    logger.info(
        f"Burnout assessment saved for job {job_id}: Risk={risk_level} ({prob:.2f}), "
        f"Top Drivers={[d['feature'] for d in top_drivers]}"
    )

    return {
        "job_id": job_id,
        "risk_level": risk_level,
        "risk_score": prob,
        "top_drivers": top_drivers,
        "metrics": metrics,
    }
