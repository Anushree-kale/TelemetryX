import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#64748b",
];

function extname(path) {
  if (!path || typeof path !== "string") return "(no ext)";
  const base = path.split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "(no ext)";
  return base.slice(dot).toLowerCase();
}

export default function LanguageBreakdown({ modules }) {
  const data = useMemo(() => {
    const counts = {};
    for (const m of modules || []) {
      const ext = extname(m.file_path);
      counts[ext] = (counts[ext] || 0) + 1;
    }
    const entries = Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const total = entries.reduce((s, e) => s + e.value, 0) || 1;
    return entries.map((e) => ({
      ...e,
      pct: Math.round((e.value / total) * 1000) / 10,
    }));
  }, [modules]);

  if (!modules?.length) return null;

  const top = data.slice(0, 10);
  const rest = data.slice(10);
  const chartData =
    rest.length > 0
      ? [
          ...top,
          {
            name: `Other (${rest.length} types)`,
            value: rest.reduce((s, r) => s + r.value, 0),
            pct:
              Math.round(
                (rest.reduce((s, r) => s + r.value, 0) / modules.length) * 1000,
              ) / 10,
          },
        ]
      : top;

  return (
    <div className="card language-breakdown-card">
      <h2>Languages &amp; file types</h2>
      <p className="card-hint">
        Distribution by file extension across analyzed modules (inferred from paths).
      </p>
      <div className="language-split">
        <div className="language-pie" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={1}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div className="pie-tooltip">
                      <strong>{p.name}</strong>
                      <div>
                        {p.value} files ({p.pct}%)
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="language-legend">
          {data.slice(0, 14).map((row, i) => (
            <li key={row.name}>
              <span
                className="lang-swatch"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <code>{row.name}</code>
              <span className="lang-count">
                {row.value} <span className="muted">({row.pct}%)</span>
              </span>
            </li>
          ))}
          {data.length > 14 && (
            <li className="muted small">+ {data.length - 14} more extensions</li>
          )}
        </ul>
      </div>
    </div>
  );
}
