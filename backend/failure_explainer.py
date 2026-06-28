"""
failure_explainer.py — SHAP-based explanations for the LSTM failure predictor.

Uses shap.DeepExplainer with the trained LSTMFailurePredictor.
SHAP values are computed per-timestep and averaged across the sequence to
produce a single per-feature attribution score.

Falls back to a fast weight-based proxy if torch / shap are unavailable
or the model hasn't been trained yet.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# ── Feature metadata ──────────────────────────────────────────────────────────

FEATURE_COLUMNS = [
    "churn_90d",
    "cyclomatic_complexity",
    "days_since_last_commit",
    "test_coverage_ratio",
    "fan_out",
    "function_count",
    "max_fn_complexity",
    "unique_authors_30d",
]

FEATURE_LABELS = {
    "churn_90d":              "Churn rate (90d)",
    "cyclomatic_complexity":  "Cyclomatic complexity",
    "days_since_last_commit": "Commit recency",
    "test_coverage_ratio":    "Test coverage gap",
    "fan_out":                "Dependency fan-out",
    "function_count":         "Function count",
    "max_fn_complexity":      "Max function complexity",
    "unique_authors_30d":     "Unique authors (30d)",
}

# Max values used for normalisation (must match failure_predictor._normalize_step)
FEATURE_MAX = {
    "churn_90d":              20.0,
    "cyclomatic_complexity":  15.0,
    "days_since_last_commit": 90.0,   # inverted: recency = 1 - days/90
    "test_coverage_ratio":    1.0,    # inverted: gap = 1 - coverage
    "fan_out":                20.0,
    "function_count":         50.0,
    "max_fn_complexity":      15.0,
    "unique_authors_30d":     5.0,
}

# ── SHAP background cache ─────────────────────────────────────────────────────
# Populated lazily the first time explain_failure_risk_shap() is called.
_BACKGROUND: "torch.Tensor | None" = None
_SHAP_EXPLAINER: Any = None  # shap.DeepExplainer instance


def _normalize_features(features: dict[str, Any]) -> list[float]:
    """Mirror of failure_predictor._normalize_step for a raw feature dict."""
    churn      = float(features.get("churn_90d") or 0.0)
    complexity = float(features.get("cyclomatic_complexity") or 0.0)
    days       = float(features.get("days_since_last_commit") or 0.0)
    coverage   = float(features.get("test_coverage_ratio") or 0.0)
    fan_out    = float(features.get("fan_out") or 0.0)
    fn_count   = float(features.get("function_count") or 0.0)
    max_fn_c   = float(features.get("max_fn_complexity") or 0.0)
    authors    = float(features.get("unique_authors_30d") or 0.0)
    return [
        min(churn / 20.0, 1.0),
        min(complexity / 15.0, 1.0),
        max(0.0, 1.0 - (days / 90.0)),
        1.0 - min(1.0, max(0.0, coverage)),
        min(fan_out / 20.0, 1.0),
        min(fn_count / 50.0, 1.0),
        min(max_fn_c / 15.0, 1.0),
        min(authors / 5.0, 1.0),
    ]


def _build_background(model: Any, torch: Any) -> "torch.Tensor":
    """
    Build a background tensor for DeepExplainer.

    We try to pull up to 50 real sequences from the database; if the database
    is unavailable we fall back to a small set of synthetic mid-range samples.
    """
    try:
        import database
        sequences = database.get_historical_metric_sequences(min_steps=3)
        bg_tensors = []
        for seqs in list(sequences.values())[:50]:
            norm = [_normalize_features(s) for s in seqs[-10:]]  # last 10 steps
            bg_tensors.append(norm)

        if bg_tensors:
            # Pad all sequences to the same length
            max_len = max(len(s) for s in bg_tensors)
            padded = np.zeros((len(bg_tensors), max_len, 8), dtype=np.float32)
            for i, seq in enumerate(bg_tensors):
                padded[i, :len(seq)] = seq
            logger.info("Built SHAP background from %d real sequences.", len(bg_tensors))
            return torch.tensor(padded, dtype=torch.float32)
    except Exception as e:
        logger.warning("Could not load real sequences for SHAP background: %s", e)

    # Synthetic fallback — 10 samples at 0.5 normalised values, seq len 5
    synthetic = np.full((10, 5, 8), 0.5, dtype=np.float32)
    logger.info("Using synthetic SHAP background (10 × 5 × 8).")
    return torch.tensor(synthetic, dtype=torch.float32)


def _get_shap_explainer(model: Any, torch: Any, shap: Any) -> Any:
    """Lazily initialise and cache the GradientExplainer.

    GradientExplainer uses input × gradient attribution and supports any
    PyTorch model including LSTMs — unlike DeepExplainer which breaks on
    unrecognised nn.Module types such as nn.LSTM.
    """
    global _BACKGROUND, _SHAP_EXPLAINER
    if _SHAP_EXPLAINER is None:
        _BACKGROUND = _build_background(model, torch)
        _SHAP_EXPLAINER = shap.GradientExplainer(model, _BACKGROUND)
        logger.info("Initialised shap.GradientExplainer for LSTM failure predictor.")
    return _SHAP_EXPLAINER


# ── Public API ────────────────────────────────────────────────────────────────

def explain_failure_risk(
    features: dict[str, Any],
    risk_score: float,
    history: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Return per-feature SHAP attributions for an LSTM failure risk prediction.

    Parameters
    ----------
    features : dict
        Raw module metric dict (same keys as FEATURE_COLUMNS).
    risk_score : float
        The already-computed risk score (0–1).
    history : list[dict] | None
        Full metric history for this module (list of per-snapshot dicts).
        When provided, SHAP is run over the real sequence.
        When None, a single-step sequence is constructed from `features`.

    Returns
    -------
    list[dict]  sorted by impact descending:
        {feature, label, value, shap_value, impact, contribution_pct}
    """
    try:
        import torch
        import shap as shap_lib
        from failure_predictor import GLOBAL_MODEL, MODEL_TRAINED

        if not MODEL_TRAINED or GLOBAL_MODEL is None:
            raise RuntimeError("LSTM model not trained yet — using fallback.")

        GLOBAL_MODEL.eval()
        explainer = _get_shap_explainer(GLOBAL_MODEL, torch, shap_lib)

        # Build input tensor: shape (1, T, 8)
        if history and len(history) >= 1:
            norm_seq = [_normalize_features(h) for h in history[-10:]]
        else:
            norm_seq = [_normalize_features(features)]

        input_tensor = torch.tensor(
            [norm_seq], dtype=torch.float32
        )  # (1, T, 8)

        # DeepExplainer requires input and background to share the same shape.
        # Pad / trim the input sequence to match the background's time dimension.
        bg_len = _BACKGROUND.shape[1]  # type: ignore[union-attr]
        in_len = input_tensor.shape[1]
        if in_len < bg_len:
            pad = torch.zeros(1, bg_len - in_len, 8, dtype=torch.float32)
            input_tensor = torch.cat([pad, input_tensor], dim=1)
        elif in_len > bg_len:
            input_tensor = input_tensor[:, -bg_len:, :]

        # shap.DeepExplainer returns list of arrays: one per layer input.
        # For a single input it's a list with one element: (1, T, 8)
        shap_vals = explainer.shap_values(input_tensor)
        if isinstance(shap_vals, list):
            shap_arr = shap_vals[0]  # (1, T, 8)
        else:
            shap_arr = shap_vals

        # Average absolute SHAP across timesteps → (8,)
        per_feature = np.mean(np.abs(shap_arr[0]), axis=0)  # (8,)
        total = float(per_feature.sum()) or 1.0

        contributions = []
        for i, feat in enumerate(FEATURE_COLUMNS):
            raw_val = features.get(feat, 0)
            if raw_val is None:
                raw_val = 0.0
            shap_val = float(np.mean(shap_arr[0, :, i]))  # signed mean
            abs_contribution = float(per_feature[i])
            pct = round(abs_contribution / total * 100, 1)
            contributions.append({
                "feature":          feat,
                "label":            FEATURE_LABELS[feat],
                "value":            float(raw_val),
                "shap_value":       round(shap_val, 4),
                "impact":           round(abs_contribution * risk_score, 4),
                "contribution_pct": pct,
            })

        return sorted(contributions, key=lambda x: x["impact"], reverse=True)

    except Exception as e:
        logger.warning("SHAP explain failed (%s) — falling back to weight proxy.", e)
        return _weight_proxy(features, risk_score)


def _weight_proxy(features: dict[str, Any], risk_score: float) -> list[dict[str, Any]]:
    """Fast weight-based fallback when SHAP / torch are unavailable."""
    weights = {
        "churn_90d":              0.25,
        "cyclomatic_complexity":  0.20,
        "days_since_last_commit": 0.10,
        "test_coverage_ratio":    0.15,
        "fan_out":                0.05,
        "function_count":         0.05,
        "max_fn_complexity":      0.10,
        "unique_authors_30d":     0.10,
    }
    contributions = []
    norm = _normalize_features(features)
    for i, feat in enumerate(FEATURE_COLUMNS):
        raw_val = features.get(feat, 0) or 0.0
        impact = round(norm[i] * weights[feat] * risk_score, 4)
        contributions.append({
            "feature":          feat,
            "label":            FEATURE_LABELS[feat],
            "value":            float(raw_val),
            "shap_value":       None,
            "impact":           impact,
            "contribution_pct": round(norm[i] * weights[feat] * 100, 1),
        })
    return sorted(contributions, key=lambda x: x["impact"], reverse=True)
