from __future__ import annotations

import json
from pathlib import Path
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
            f"file — low test file presence is {pct:.0f}% of the risk here. Add "
            f"tests before making further changes."
        )

    if feature == "churn_90d":
        return (
            f"This file has been edited {value} in the last 90 days — "
            f"frequent changes make up {pct:.0f}% of the risk score. Files "
            f"that change often without a matching test file are more "
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


# ── Client-facing file health narrative ──────────────────────────────────────

def build_file_narrative(
    module: dict[str, Any],
    shap_drivers: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Generate a structured, client-readable health report for a single file.

    Returns a list of section dicts:
        {
          "severity": "critical" | "warning" | "info" | "ok" | "actions",
          "title":    str,
          "body":     str,
          "actions":  list[str]  (only present on the "actions" section)
        }

    No raw metric numbers are surfaced — every sentence is written so a
    non-technical stakeholder can understand what is wrong and why it matters.
    """
    sections: list[dict[str, Any]] = []
    actions: list[str] = []

    file_path = module.get("file_path", "")
    filename = Path(file_path).name or file_path

    # ── Collect signals ───────────────────────────────────────────────────────
    cyclomatic   = float(module.get("cyclomatic_complexity") or 0)
    max_fn       = int(module.get("max_fn_complexity") or 0)
    worst_fn     = (module.get("worst_function_name") or "").strip()
    worst_start  = int(module.get("worst_function_start") or 0)
    worst_end    = int(module.get("worst_function_end") or 0)
    loc          = int(module.get("lines_of_code") or 0)
    fn_count     = int(module.get("function_count") or 0)
    fan_out      = int(module.get("fan_out") or 0)
    churn        = int(module.get("churn_90d") or 0)
    coverage     = float(module.get("test_coverage_ratio") or 0)
    bug_ratio    = float(module.get("bug_fix_ratio") or 0)
    top_auth_pct = float(module.get("top_author_pct") or 0)
    uniq_authors = int(module.get("unique_author_count") or 0)
    days_stale   = int(module.get("days_since_last_commit") or 0)

    imports_raw = str(module.get("imports") or "")
    imports_list = [i.strip() for i in imports_raw.split(",") if i.strip()]

    co_changes = module.get("co_changes") or {}
    if isinstance(co_changes, str):
        try:
            co_changes = json.loads(co_changes)
        except Exception:
            co_changes = {}
            
    file_stem = Path(file_path).stem or filename

    # ── Pattern Detection & Architectural Findings ────────────────────────────

    # 1. Orchestration Layer / High Coupling (Fan-out)
    if fan_out > 10:
        sev = "critical" if fan_out > 16 else "warning"
        named = imports_list[:4]
        named_str = ", ".join(named) if named else "various subsystems"
        body = (
            f"This module has become an orchestration layer. It coordinates "
            f"across {fan_out} other components ({named_str}). Changes in any of "
            f"those systems are likely to require changes here as well, creating a fragility bottleneck."
        )
        sections.append({"severity": sev, "title": "Architectural Bottleneck", "body": body})
        actions.append(f"Consider introducing interfaces or event-driven patterns to decouple {filename} from its dependencies.")
    elif fan_out > 6:
        named = imports_list[:3]
        named_str = ", ".join(named) if named else f"{fan_out} modules"
        body = (
            f"This file acts as a central coordinator for {fan_out} dependencies ({named_str}…). "
            f"It is starting to accumulate cross-domain knowledge."
        )
        sections.append({"severity": "info", "title": "Growing Orchestration Role", "body": body})

    # 2. God Function / Overloaded Logic (Complexity)
    if max_fn > 10 and worst_fn:
        sev = "critical" if max_fn > 20 else "warning"
        body = (
            f"The `{worst_fn}()` function has absorbed too many responsibilities over time. "
            f"With {max_fn} decision branches, it is highly likely that modifying one behavior "
            f"will unintentionally break another. This level of complexity is a primary driver of regressions."
        )
        sections.append({"severity": sev, "title": "Overloaded Logic Core", "body": body})
        actions.append(f"Extract distinct responsibilities from `{worst_fn}()` into smaller, independent functions.")

    # 3. Unvalidated Active Development (Coverage + Churn)
    if coverage < 0.15 and churn > 4:
        sev = "critical" if coverage < 0.05 else "warning"
        body = (
            f"This file is being actively modified without an automated safety net. "
            f"With {churn} edits recently and minimal test file presence ({coverage*100:.0f}% ratio), "
            f"the team is flying blind. Every change carries a high risk of introducing undetected regressions."
        )
        sections.append({"severity": sev, "title": "Unvalidated Active Development", "body": body})
        actions.append(f"Pause feature development in {filename} to establish a matching test file.")
    elif coverage < 0.15:
        body = (
            f"Core logic in this module lacks verification. "
            f"With a test file ratio of only {coverage*100:.0f}%, regressions are likely to slip through to production."
        )
        sections.append({"severity": "warning", "title": "Insufficient Verification", "body": body})

    # 4. Corrective Churn Loop (Bug-fix ratio)
    if bug_ratio > 0.35:
        sev = "critical" if bug_ratio > 0.55 else "warning"
        body = (
            f"Most commits to this file are correcting previous changes rather than adding new functionality. "
            f"Historically, {bug_ratio * 100:.0f}% of changes were bug fixes. This suggests developers "
            f"frequently underestimate the complexity of modifying this module, leading to a cycle of patches."
        )
        sections.append({"severity": sev, "title": "Corrective Churn Loop", "body": body})
        actions.append(f"Schedule a structural refactoring of {filename} rather than continuing to apply surface-level patches.")
    elif bug_ratio > 0.20:
        pct = f"{bug_ratio * 100:.0f}"
        body = (
            f"{pct}% of commits to this file were bug fixes — above average. "
            f"This file may benefit from clearer logic, the presence of test files, "
            f"or a review of its core design."
        )
        sections.append({"severity": "info", "title": "Above-average bug fix rate", "body": body})

    # 5. Siloed Knowledge (Author concentration)
    if uniq_authors == 1 or (top_auth_pct > 0.85 and uniq_authors > 1):
        sev = "warning"
        body = (
            f"Knowledge of this module is highly concentrated in one developer "
            f"({top_auth_pct * 100:.0f}% of all history). "
            f"Future maintenance, debugging, and feature work will bottleneck significantly if that person is unavailable."
        )
        sections.append({"severity": sev, "title": "Siloed Domain Knowledge", "body": body})
        actions.append(f"Enforce mandatory code reviews by secondary authors for all future changes to {filename}.")

    # 6. Tightly Coupled Lifecycles (Co-change)
    if isinstance(co_changes, dict) and co_changes:
        top_co = sorted(co_changes.items(), key=lambda x: x[1], reverse=True)[:1]
        if top_co and top_co[0][1] >= 4:
            coupled_file = Path(top_co[0][0]).name
            coupled_stem = Path(top_co[0][0]).stem
            count = top_co[0][1]
            body = (
                f"The `{file_stem}` and `{coupled_stem}` layers have become tightly coupled over time. "
                f"Feature work in one almost always requires modifications in the other (changed together {count} times recently). "
                f"This lockstep evolution indicates blurred architectural boundaries."
            )
            sections.append({"severity": "info", "title": "Tightly Coupled Lifecycles", "body": body})
            actions.append(f"Review the boundary between {filename} and {coupled_file} to establish a cleaner contract.")

    # 7. Monolithic Growth (File size)
    if loc > 500:
        sev = "warning"
        body = (
            f"This module is accumulating unrelated responsibilities. "
            f"At {loc} lines of code, it acts as a gravity well, pulling in logic that "
            f"should belong elsewhere. This makes the file daunting to review and dangerous to modify."
        )
        sections.append({"severity": sev, "title": "Monolithic Growth", "body": body})
        actions.append(f"Identify distinct feature sets within {filename} and extract them into their own modules.")

    # 8. Abandoned Code (Staleness)
    if days_stale > 365:
        body = (
            f"This module has been untouched for over a year ({days_stale} days). "
            f"While it may be stable, it is increasingly likely that it relies on outdated patterns "
            f"or dead code paths that no longer align with the rest of the system."
        )
        sections.append({"severity": "info", "title": "Stale Implementation", "body": body})

    # ── Suggested actions ─────────────────────────────────────────────────────
    if actions:
        sections.append({
            "severity": "actions",
            "title": "Suggested actions",
            "body": "",
            "actions": actions,
        })

    # ── Healthy fallback ──────────────────────────────────────────────────────
    if not sections:
        sections.append({
            "severity": "ok",
            "title": "Stable Component",
            "body": (
                "This module exhibits healthy architectural patterns. Complexity is isolated, "
                "dependencies are manageable, and change patterns indicate predictable, feature-driven development."
            ),
        })

    return sections