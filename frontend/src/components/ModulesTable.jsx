import { useMemo, useState, useEffect } from "react";
import ModuleDetailDrawer from "./ModuleDetailDrawer";
import { COLUMN_LABELS, GLOSSARY, RISK_LABELS, RISK_FILTERS } from "../labels";

const COLUMNS = Object.keys(COLUMN_LABELS).map((key) => ({
  key,
  label: COLUMN_LABELS[key],
  align:
    key === "file_path" ? "left" : key === "risk_level" ? "center" : "right",
  sortable: key !== "file_path",
}));

// Columns hidden by default — visible only when "Show advanced" is toggled on.
// cyclomatic_complexity is intentionally NOT in this set: it's the single
// most direct per-file complexity signal and is worth surfacing by default.
const ADVANCED_COLUMN_KEYS = new Set([
  "betweenness",
  "downstream_count",
  "out_degree",
  "top_author_pct",
  "test_coverage_ratio",
]);

const RISK_COLORS = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const ITEMS_PER_PAGE = 25;

function truncateNarrative(narrative, max = 140) {
  if (!Array.isArray(narrative) || narrative.length === 0) return "";
  const topSection = narrative.find(n => n.severity === "critical" || n.severity === "warning") || narrative[0];
  if (!topSection) return "";
  
  const text = `${topSection.title}: ${topSection.body || ''}`.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatCell(key, row) {
  const v = row[key];
  switch (key) {
    case "file_path":
      return row.file_path;
    case "debt_score":
      return v != null ? Number(v).toFixed(1) : "—";
    case "risk_level":
      return RISK_LABELS[row.risk_level] || row.risk_level || "—";
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const visibleColumns = showAdvanced
    ? COLUMNS
    : COLUMNS.filter((c) => !ADVANCED_COLUMN_KEYS.has(c.key));

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
        <button
          type="button"
          className={`filter-btn ${showAdvanced ? "active" : ""}`}
          style={{ marginLeft: "auto" }}
          onClick={() => setShowAdvanced((v) => !v)}
          title="Toggle Centrality, Downstream impact, Dependencies, Top contributor %, Test file ratio"
        >
          {showAdvanced ? "Hide advanced" : "Show advanced"}
        </button>
      </div>

      <div className="modules-table-scroll">
        <table className="modules-table modules-table-wide">
          <thead>
            <tr>
              {visibleColumns.map((col) => (
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
                {visibleColumns.map((col) => (
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
                        {row.narrative && Array.isArray(row.narrative) && row.narrative.length > 0 ? (
                          <p className="file-summary-preview" title="View details for full report">
                            {truncateNarrative(row.narrative)}
                          </p>
                        ) : row.summary ? (
                          <p className="file-summary-preview" title={row.summary}>
                            {truncateNarrative(row.summary)}
                          </p>
                        ) : null}
                      </div>
                    ) : col.key === "risk_level" ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          className="risk-pill"
                          style={{
                            background: RISK_COLORS[row.risk_level] || RISK_COLORS.low,
                          }}
                        >
                          {formatCell(col.key, row)}
                        </span>
                        {row.trend && (
                          <span 
                            title={`Trend over last 3 scans: ${row.trend}`}
                            style={{
                              fontSize: "1.1em",
                              color: row.trend === "worsening" ? "#ef4444" : row.trend === "improving" ? "#22c55e" : "#8b9cb3"
                            }}
                          >
                            {row.trend === "worsening" ? "↑" : row.trend === "improving" ? "↓" : "—"}
                          </span>
                        )}
                      </div>
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
