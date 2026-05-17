import { useMemo, useState } from "react";
import ModuleDetailDrawer from "./ModuleDetailDrawer";

const COLUMNS = [
  { key: "file_path", label: "File", align: "left" },
  { key: "debt_score", label: "Debt", align: "right" },
  { key: "risk_level", label: "Risk", align: "center" },
  { key: "churn_90d", label: "Churn", align: "right" },
  { key: "lines_of_code", label: "LOC", align: "right" },
  { key: "roi_days", label: "ROI (days)", align: "right" },
  { key: "cyclomatic_complexity", label: "Cyclomatic", align: "right" },
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

export default function ModulesTable({ modules }) {
  const [sortKey, setSortKey] = useState("debt_score");
  const [sortDir, setSortDir] = useState("desc");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selected, setSelected] = useState(null);

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
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key) => {
    if (key === "file_path") return;
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

      <div style={{ overflowX: "auto" }}>
        <table className="modules-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    textAlign: col.align,
                    cursor: col.key === "file_path" ? "default" : "pointer",
                  }}
                >
                  {col.label}
                  {col.key !== "file_path" && sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`${row.file_path}-${row.job_id ?? row.id ?? i}`}
                className="module-row"
                onClick={() => setSelected(row)}
              >
                <td className="cell-path">{row.file_path}</td>
                <td className="cell-num">
                  {row.debt_score != null ? row.debt_score.toFixed(1) : "—"}
                </td>
                <td style={{ textAlign: "center" }}>
                  <span
                    className="risk-pill"
                    style={{
                      background:
                        RISK_COLORS[row.risk_level] || RISK_COLORS.low,
                    }}
                  >
                    {row.risk_level || "—"}
                  </span>
                </td>
                <td className="cell-num">{row.churn_90d ?? 0}</td>
                <td className="cell-num">{row.lines_of_code}</td>
                <td className="cell-num">
                  {row.roi_days != null ? row.roi_days.toFixed(1) : "—"}
                </td>
                <td className="cell-num">
                  {row.cyclomatic_complexity?.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModuleDetailDrawer module={selected} onClose={() => setSelected(null)} />
    </>
  );
}
