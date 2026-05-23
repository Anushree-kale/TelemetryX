"""Build CSV/PDF exports for a completed analysis job."""

import csv
import io
import json
from typing import Any

from fpdf import FPDF

EXPORT_COLUMNS = [
    "file_path",
    "debt_score",
    "risk_level",
    "priority_score",
    "lines_of_code",
    "churn_90d",
    "cyclomatic_complexity",
    "test_coverage_ratio",
    "unique_author_count",
    "top_author_pct",
    "bug_fix_ratio",
    "days_since_last_commit",
    "downstream_count",
    "out_degree",
    "betweenness",
    "is_critical",
    "roi_days",
]


def _cell_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)


def build_csv(modules: list[dict[str, Any]], limit: int) -> bytes:
    rows = modules[:limit]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=EXPORT_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for mod in rows:
        writer.writerow({col: _cell_value(mod.get(col)) for col in EXPORT_COLUMNS})
    return buf.getvalue().encode("utf-8")


def build_pdf(job: dict[str, Any], modules: list[dict[str, Any]], limit: int) -> bytes:
    rows = modules[:limit]
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "TelemetryX export", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=10)
    pdf.cell(0, 6, f"Job {job['id']}  |  {job.get('repo_url', '')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Modules: {len(rows)} (limit {limit})", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    col_widths = [90, 18, 18, 18, 16, 16, 22, 18, 18, 18, 18, 22, 20, 16, 18, 14, 16]
    usable_width = pdf.w - pdf.l_margin - pdf.r_margin
    total = sum(col_widths)
    if total > usable_width:
        scale = usable_width / total
        col_widths = [w * scale for w in col_widths]
    headers = [
        "File",
        "Debt",
        "Risk",
        "Priority",
        "LOC",
        "Churn",
        "Complex",
        "Coverage",
        "Authors",
        "Top %",
        "Bug fix",
        "Days idle",
        "Downstream",
        "Out deg",
        "Between",
        "Critical",
        "ROI days",
    ]
    pdf.set_font("Helvetica", "B", 7)
    for w, h in zip(col_widths, headers):
        pdf.cell(w, 6, h, border=1)
    pdf.ln()

    pdf.set_font("Helvetica", size=6)
    for mod in rows:
        values = [
            _cell_value(mod.get(col))[:80] if col == "file_path" else _cell_value(mod.get(col))
            for col in EXPORT_COLUMNS
        ]
        for w, val in zip(col_widths, values):
            pdf.cell(w, 5, val[:40], border=1)
        pdf.ln()

    return bytes(pdf.output())
