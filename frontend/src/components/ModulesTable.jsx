import { useMemo, useState, useEffect } from "react";
import ModuleDetailDrawer from "./ModuleDetailDrawer";

const GLOSSARY = {
  file_path: "Repository path to the source file.",
  debt_score:
    "0–100 technical debt estimate from the model: higher means more rework risk and harder changes.",
  risk_level: "High / medium / low band from debt score thresholds.",
  priority_score: "Blended score used for fix ordering (impact vs. effort).",
  unique_author_count: "How many different people touched this file recently.",
  top_author_pct: "Share of commits from the most active author (bus factor signal).",
  bug_fix_ratio: "Portion of commits that look like bug fixes vs. features.",
  days_since_last_commit: "Days since the last commit touching this file (staleness).",
  downstream_count: "Rough count of other files that depend on this one (blast radius).",
  out_degree: "How many other files this file imports (local dependency fan-out).",
  betweenness:
    "How often this file lies on shortest paths in the dependency graph (bottleneck / bridge).",
  churn_90d: "Number of edits in the last 90 days (change rate, not quality).",
  lines_of_code: "Non-blank lines counted in this module.",
  roi_days: "Estimated engineering days saved if debt is reduced (model hint, not a promise).",
  cyclomatic_complexity: "Branching complexity—more paths usually mean harder tests and reviews.",
  test_coverage_ratio:
    "Test file lines ÷ source lines for this path (a ratio heuristic, not instrumented coverage).",
};

const COLUMNS = [
  { key: "file_path", label: "File & narrative", align: "left", sortable: false },
  { key: "debt_score", label: "Debt score", align: "right", sortable: true },
  { key: "risk_level", label: "Risk band", align: "center", sortable: true },
  { key: "priority_score", label: "Priority", align: "right", sortable: true },
  { key: "unique_author_count", label: "Authors", align: "right", sortable: true },
  { key: "top_author_pct", label: "Top author %", align: "right", sortable: true },
  { key: "bug_fix_ratio", label: "Bug-fix rate", align: "right", sortable: true },
  { key: "days_since_last_commit", label: "Stale days", align: "right", sortable: true },
  { key: "downstream_count", label: "Blast radius", align: "right", sortable: true },
  { key: "out_degree", label: "Dependencies", align: "right", sortable: true },
  { key: "betweenness", label: "Centrality", align: "right", sortable: true },
  { key: "churn_90d", label: "Change rate (90d)", align: "right", sortable: true },
  { key: "lines_of_code", label: "LOC", align: "right", sortable: true },
  { key: "test_coverage_ratio", label: "Test file ratio", align: "right", sortable: true },
  { key: "roi_days", label: "ROI (days)", align: "right", sortable: true },
  { key: "cyclomatic_complexity", label: "Complexity", align: "right", sortable: true },
];

const RISK_FILTERS = [
  { id: "all", label: "All" },
  { id: "high", label: "High risk" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

const RISK_COLORS = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const ITEMS_PER_PAGE = 25;

function truncateSummary(text, max = 140) {
  if (!text || typeof text !== "string") return "";
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatCell(key, row) {
  const v = row[key];
  switch (key) {
    case "file_path":
      return row.file_path;
    case "debt_score":
      return v != null ? Number(v).toFixed(1) : "—";
    case "risk_level":
      return row.risk_level || "—";
    case "priority_score":
      return v != null ? Number(v).toFixed(1) : "—";
    case "unique_author_count":
      return v != null ? v : "—";
    case "top_author_pct":
      return v != null ? `${Number(v).toFixed(0)}%` : "—";
    case "bug_fix_ratio": {
      if (v == null) return "—";
      const n = Number(v);
      if (n <= 1 && n >= 0) return `${(n * 100).toFixed(0)}%`;
      return `${n.toFixed(0)}%`;
    }
    case "days_since_last_commit":
      return v != null ? v : "—";
    case "downstream_count":
    case "out_degree":
      return v != null ? v : "—";
    case "betweenness":
      return v != null ? Number(v).toFixed(3) : "—";
    case "churn_90d":
      return v ?? 0;
    case "lines_of_code":
      return row.lines_of_code;
    case "test_coverage_ratio":
      return v != null ? `${(Number(v) * 100).toFixed(0)}%` : "—";
    case "roi_days":
      return v != null ? Number(v).toFixed(1) : "—";
    case "cyclomatic_complexity":
      return row.cyclomatic_complexity?.toFixed(2) ?? "—";
    default:
      return v ?? "—";
  }
}

export default function ModulesTable({ modules }) {
  const [sortKey, setSortKey] = useState("debt_score");
  const [sortDir, setSortDir] = useState("desc");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    if (riskFilter === "all") return modules;
    return modules.filter((m) => m.risk_level === riskFilter);
  }, [modules, riskFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setCurrentPage(1);
  }, [riskFilter, sortKey, sortDir, modules]);

  const pageCount = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = useMemo(() => {
    return sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sorted, startIndex]);

  const handleSort = (key) => {
    const col = COLUMNS.find((c) => c.key === key);
    if (!col?.sortable) return;
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIndicator = (key) => {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  return (
    <>
      <details className="modules-glossary">
        <summary>What do these columns mean?</summary>
        <dl className="modules-glossary-list">
          {COLUMNS.map((col) => (
            <div key={col.key} className="modules-glossary-row">
              <dt>{col.label}</dt>
              <dd>{GLOSSARY[col.key] || "—"}</dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="table-toolbar">
        <span className="toolbar-label">Risk filter</span>
        {RISK_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`filter-btn ${riskFilter === f.id ? "active" : ""}`}
            onClick={() => setRiskFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        <span className="toolbar-count">
          {sorted.length} module{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="modules-table-scroll">
        <table className="modules-table modules-table-wide">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  title={GLOSSARY[col.key]}
                  style={{
                    textAlign: col.align,
                    cursor: col.sortable ? "pointer" : "default",
                  }}
                >
                  {col.label}
                  {col.sortable && sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, i) => (
              <tr
                key={`${row.file_path}-${row.job_id ?? row.id ?? i}`}
                className={`module-row ${row.is_critical ? "row-critical" : ""}`}
                onClick={() => setSelected(row)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(row);
                  }
                }}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.key === "file_path"
                        ? "cell-path cell-path-primary"
                        : col.align === "right"
                          ? "cell-num"
                          : ""
                    }
                    style={col.key === "risk_level" ? { textAlign: "center" } : undefined}
                  >
                    {col.key === "file_path" ? (
                      <div className="file-cell">
                        <div className="file-cell-path-row">
                          <span className="file-path-text" title={row.file_path}>
                            {formatCell(col.key, row)}
                          </span>
                          <span className="file-details-hint" aria-hidden>
                            Details ↗
                          </span>
                        </div>
                        {row.summary ? (
                          <p className="file-summary-preview" title={row.summary}>
                            {truncateSummary(row.summary)}
                          </p>
                        ) : null}
                      </div>
                    ) : col.key === "risk_level" ? (
                      <span
                        className="risk-pill"
                        style={{
                          background: RISK_COLORS[row.risk_level] || RISK_COLORS.low,
                        }}
                      >
                        {formatCell(col.key, row)}
                      </span>
                    ) : (
                      formatCell(col.key, row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="pagination">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
            className="pagination-btn"
          >
            Next
          </button>
        </div>
      )}

      <ModuleDetailDrawer module={selected} onClose={() => setSelected(null)} />
    </>
  );
}
