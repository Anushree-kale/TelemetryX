import { useMemo, useState } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

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

function TreemapNode(props) {
  const { x, y, width, height, name, debtScore, loc, fullPath } = props;
  if (width < 4 || height < 4) return null;

  const label = name && name.length > 14 ? `${name.slice(0, 12)}…` : name;

  // Only show text if block is big enough to prevent overlapping/noise
  const showText = width > 55 && height > 28;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={debtColor(debtScore)}
        stroke="#0c1015"
        strokeWidth={1.5}
        rx={3}
        style={{
          transition: "all 0.25s ease",
          cursor: "pointer",
        }}
      />
      {showText && (
        <>
          {/* Subtle text drop shadow for premium legibility */}
          <text
            x={x + 6}
            y={y + 16}
            fill="#000000"
            fontSize={10}
            fontWeight={600}
            opacity={0.35}
          >
            {label}
          </text>
          <text
            x={x + 6}
            y={y + 15}
            fill="#ffffff"
            fontSize={10}
            fontWeight={600}
          >
            {label}
          </text>
          {height > 40 && (
            <text
              x={x + 6}
              y={y + 28}
              fill="rgba(255, 255, 255, 0.7)"
              fontSize={9}
              fontWeight={400}
            >
              {loc} LOC
            </text>
          )}
        </>
      )}
      <title>
        {`${fullPath}\nLOC: ${loc}\nDebt: ${debtScore?.toFixed?.(1) ?? "—"}`}
      </title>
    </g>
  );
}

export default function DebtHeatmap({ modules }) {
  const [minLoc, setMinLoc] = useState(25); // Default to >= 25 LOC to remove small noisy files

  const data = useMemo(() => {
    return modules
      .filter((m) => (m.lines_of_code ?? 0) >= minLoc)
      .map((m) => ({
        name: m.file_path.split("/").pop(),
        fullPath: m.file_path,
        size: Math.max(1, m.lines_of_code ?? 1),
        debtScore: m.debt_score ?? 0,
        loc: m.lines_of_code,
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
        <div style={{ position: "relative", width: "100%", height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={data}
              dataKey="size"
              aspectRatio={16 / 9}
              stroke="#0c1015"
              content={<TreemapNode />}
            >
              <Tooltip
                contentStyle={{
                  background: "#121b26",
                  border: "1px solid #233041",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
                  color: "#f1f5f9",
                  padding: "8px 12px",
                }}
                formatter={(_, __, item) => {
                  const p = item?.payload;
                  if (!p) return null;
                  return [
                    <span style={{ color: "#f8fafc" }} key="val">
                      <strong>LOC:</strong> {p.loc} &nbsp;·&nbsp; <strong>Debt:</strong> {p.debtScore?.toFixed(1)}
                    </span>,
                    <span style={{ color: "#94a3b8", fontSize: "0.85rem" }} key="path">
                      {p.fullPath}
                    </span>
                  ];
                }}
              />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
