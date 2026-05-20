import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from "recharts";

// Premium dynamic gradient from rich green -> warm amber -> elegant red
function debtColor(score) {
  if (score == null) return "hsl(215, 15%, 40%)";
  const clamped = Math.max(0, Math.min(100, score));
  let hue;
  if (clamped < 40) {
    // Interpolate from 140 (green) to 45 (amber)
    hue = 140 - (clamped / 40) * (140 - 45);
  } else {
    // Interpolate from 45 (amber) to 0 (red)
    hue = 45 - ((clamped - 40) / 60) * 45;
  }
  return `hsl(${hue}, 70%, 42%)`;
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div
        className="custom-tooltip"
        style={{
          background: "#121b26",
          border: "1px solid #233041",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          color: "#f1f5f9",
          padding: "8px 12px",
          fontSize: "0.82rem",
          maxWidth: 320,
        }}
      >
        <p style={{ margin: 0, fontWeight: 600, color: "#f8fafc", wordBreak: "break-all" }}>
          {data.fullPath}
        </p>
        <div
          style={{
            marginTop: 6,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "4px 12px",
          }}
        >
          <div>
            <strong>LOC:</strong> {data.loc}
          </div>
          <div>
            <strong>Complexity:</strong> {data.complexity}
          </div>
          <div>
            <strong>Churn (90d):</strong> {data.churn}
          </div>
          <div>
            <strong>Debt Score:</strong> {data.debtScore?.toFixed(1) ?? "—"}
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function DebtHeatmap({ modules }) {
  const [minLoc, setMinLoc] = useState(25); // Default to >= 25 LOC to remove small noisy files

  const data = useMemo(() => {
    return modules
      .filter((m) => (m.lines_of_code ?? 0) >= minLoc)
      .map((m) => ({
        name: m.file_path.split("/").pop(),
        fullPath: m.file_path,
        loc: m.lines_of_code ?? 0,
        complexity: m.cyclomatic_complexity ?? 0,
        churn: m.churn_90d ?? 0,
        debtScore: m.debt_score ?? 0,
      }));
  }, [modules, minLoc]);

  const locFilters = [
    { label: "Show All", value: 0 },
    { label: "≥ 10 LOC", value: 10 },
    { label: "≥ 25 LOC", value: 25 },
    { label: "≥ 50 LOC", value: 50 },
    { label: "≥ 100 LOC", value: 100 },
  ];

  return (
    <div className="heatmap-container">
      <div className="heatmap-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-label">Minimum file size:</span>
          <div className="filter-buttons">
            {locFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`filter-btn ${minLoc === f.value ? "active" : ""}`}
                onClick={() => setMinLoc(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="heatmap-legend">
          <span className="legend-label">Debt Score:</span>
          <div className="legend-gradient">
            <span className="legend-text">Low</span>
            <div className="gradient-bar" />
            <span className="legend-text">High</span>
          </div>
        </div>
      </div>

      {!data.length ? (
        <div className="heatmap-empty">
          <p>No modules fit the selected minimum size filter.</p>
        </div>
      ) : (
        <div style={{ position: "relative", width: "100%", height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{
                top: 20,
                right: 25,
                bottom: 25,
                left: 10,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#233041" opacity={0.5} />
              <XAxis
                type="number"
                dataKey="loc"
                name="Lines of Code"
                stroke="#8b9cb3"
                tick={{ fontSize: 10 }}
                label={{
                  value: "Lines of Code (LOC)",
                  position: "insideBottom",
                  offset: -12,
                  fill: "#8b9cb3",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
              <YAxis
                type="number"
                dataKey="complexity"
                name="Complexity"
                stroke="#8b9cb3"
                tick={{ fontSize: 10 }}
                label={{
                  value: "Cyclomatic Complexity",
                  angle: -90,
                  position: "insideLeft",
                  offset: 0,
                  fill: "#8b9cb3",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
              <ZAxis type="number" dataKey="churn" range={[70, 450]} />
              <Tooltip content={<CustomTooltip />} />
              <Scatter name="Modules" data={data}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={debtColor(entry.debtScore)}
                    stroke="#0c1015"
                    strokeWidth={1}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
