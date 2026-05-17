from typing import Any

import numpy as np
import shap

from debt_model import FEATURE_COLUMNS, FEATURE_LABELS, DebtScorer, _feature_matrix


def _display_value(feature: str, row: dict[str, Any]) -> str:
    val = row.get(feature, 0)
    if feature == "test_coverage_ratio":
        return f"{float(val) * 100:.0f}%"
    if feature == "churn_90d":
        return f"{int(val)} edits"
    if isinstance(val, float):
        return f"{val:.1f}"
    return str(val)


def build_shap_explanations(
    scorer: DebtScorer,
    rows: list[dict[str, Any]],
) -> list[list[dict[str, Any]]]:
    if not rows or scorer.model is None:
        return [[] for _ in rows]

    X = _feature_matrix(rows)
    explainer = shap.TreeExplainer(scorer.model)
    shap_values = explainer.shap_values(X)

    if isinstance(shap_values, list):
        shap_values = shap_values[1] if len(shap_values) > 1 else shap_values[0]

    all_explanations: list[list[dict[str, Any]]] = []
    for row, sv_row in zip(rows, shap_values):
        abs_vals = np.abs(sv_row)
        total = float(abs_vals.sum()) or 1.0
        ranked = sorted(
            enumerate(sv_row),
            key=lambda item: abs(item[1]),
            reverse=True,
        )[:3]

        explanations: list[dict[str, Any]] = []
        for idx, shap_val in ranked:
            feature = FEATURE_COLUMNS[idx]
            pct = round(abs(float(shap_val)) / total * 100, 1)
            explanations.append(
                {
                    "feature": FEATURE_LABELS.get(feature, feature),
                    "shap_value": round(float(shap_val), 4),
                    "contribution_pct": pct,
                    "display_value": _display_value(feature, row),
                }
            )
        all_explanations.append(explanations)

    return all_explanations


def reasons_to_text(reasons: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for r in reasons:
        lines.append(
            f"{r['feature']} ({r['display_value']}) is driving "
            f"{r['contribution_pct']:.0f}% of this score."
        )
    return lines
