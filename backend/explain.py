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


# Reverse map from a human-readable feature label (what's stored on the
# shap_explanations row) back to the raw feature key, so we know which
# code-grounded template to use.
_LABEL_TO_FEATURE = {label: key for key, label in FEATURE_LABELS.items()}

# Features whose story is "this function is too complex" — these are the
# ones where we have a concrete function name/line-range to point at.
_COMPLEXITY_FEATURES = {
    "cyclomatic_complexity",
    "cognitive_complexity",
    "max_fn_complexity",
}


def _hotspot_phrase(module: dict[str, Any] | None) -> str | None:
    """Return a 'function X (lines A-B)' phrase if we have a real hotspot,
    otherwise None so callers can fall back to file-level language."""
    if not module:
        return None
    name = module.get("worst_function_name")
    start = module.get("worst_function_start") or 0
    end = module.get("worst_function_end") or 0
    if not name or not start:
        return None
    return f"`{name}()` (lines {start}-{end})"


def _reason_sentence(r: dict[str, Any], module: dict[str, Any] | None) -> str:
    """Build one code-grounded sentence for a single ranked reason.

    Falls back to the original generic phrasing if we don't recognize the
    feature or don't have enough module context to be specific.
    """
    label = r.get("feature", "")
    feature = _LABEL_TO_FEATURE.get(label, label)
    value = r.get("display_value", "")
    pct = r.get("contribution_pct", 0)

    if feature in _COMPLEXITY_FEATURES:
        hotspot = _hotspot_phrase(module)
        if hotspot:
            return (
                f"{hotspot} is the most complex function in this file "
                f"(complexity {value}) — consider breaking it into smaller "
                f"functions. This accounts for {pct:.0f}% of the risk score."
            )
        return (
            f"This file's functions are highly complex (complexity {value}), "
            f"making {pct:.0f}% of the risk score — look for a function that "
            f"can be split into smaller pieces."
        )

    if feature == "test_coverage_ratio":
        return (
            f"Only {value} of this file's code is covered by a matching test "
            f"file — low test coverage is {pct:.0f}% of the risk here. Add "
            f"tests before making further changes."
        )

    if feature == "churn_90d":
        return (
            f"This file has been edited {value} in the last 90 days — "
            f"frequent changes make up {pct:.0f}% of the risk score. Files "
            f"that change often without matching test coverage are more "
            f"likely to break."
        )

    if feature == "fan_out":
        return (
            f"This file depends on {value} other modules — that coupling "
            f"drives {pct:.0f}% of the risk score, since a bug here can "
            f"ripple through everything that imports it."
        )

    if feature == "lines_of_code":
        return (
            f"At {value} lines, this file's size alone accounts for "
            f"{pct:.0f}% of the risk score — it's a candidate for splitting "
            f"into smaller modules."
        )

    if feature == "function_count":
        return (
            f"This file defines {value} functions, contributing {pct:.0f}% "
            f"of the risk score — that's a sign it may be doing too much."
        )

    # Unknown feature: keep the original generic phrasing rather than fail.
    return f"{label} ({value}) is driving {pct:.0f}% of this score."


def reasons_to_text(
    reasons: list[dict[str, Any]],
    module: dict[str, Any] | None = None,
) -> list[str]:
    """Turn ranked SHAP reasons into plain-language, code-grounded sentences.

    `module` is the module's row (file_path, worst_function_name/start/end,
    etc.) so complexity-related reasons can point at the actual function
    instead of only citing a number. It's optional so existing callers that
    don't have it yet keep working, just with less specific text.
    """
    return [_reason_sentence(r, module) for r in reasons]