import { useMemo, useState } from "react";

const COLUMNS = [
  { key: "file_path", label: "File" },
  { key: "cyclomatic_complexity", label: "Cyclomatic" },
  { key: "cognitive_complexity", label: "Cognitive" },
  { key: "lines_of_code", label: "LOC" },
  { key: "function_count", label: "Functions" },
];

export default function ModulesTable({ modules }) {
  const [sortKey, setSortKey] = useState("cyclomatic_complexity");
  const [sortDir, setSortDir] = useState("desc");

  const sorted = useMemo(() => {
    const copy = [...modules];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [modules, sortKey, sortDir]);

  const handleSort = (key) => {
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
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                style={{
                  textAlign: col.key === "file_path" ? "left" : "right",
                  padding: "0.6rem 0.75rem",
                  borderBottom: "1px solid #2a3548",
                  color: "#8b9cb3",
                  cursor: "pointer",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
                {sortIndicator(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={`${row.file_path}-${row.job_id ?? i}`}>
              <td
                style={{
                  padding: "0.5rem 0.75rem",
                  borderBottom: "1px solid #1e2a3a",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.8rem",
                }}
              >
                {row.file_path}
              </td>
              <td style={cellStyle}>{row.cyclomatic_complexity?.toFixed(2)}</td>
              <td style={cellStyle}>{row.cognitive_complexity?.toFixed(2)}</td>
              <td style={cellStyle}>{row.lines_of_code}</td>
              <td style={cellStyle}>{row.function_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellStyle = {
  textAlign: "right",
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #1e2a3a",
};
