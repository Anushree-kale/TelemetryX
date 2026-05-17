import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const RISK_COLORS = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

function DebtGauge({ score }) {
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const color =
    pct >= 70 ? "#ef4444" : pct >= 40 ? "#f59e0b" : "#22c55e";

  return (
    <div className="debt-gauge">
      <svg viewBox="0 0 120 70" className="gauge-svg">
        <path
          d="M 10 65 A 50 50 0 0 1 110 65"
          fill="none"
          stroke="#2a3548"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 10 65 A 50 50 0 0 1 110 65"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 157} 157`}
        />
      </svg>
      <div className="gauge-value" style={{ color }}>
        {pct.toFixed(0)}
      </div>
      <span className="gauge-label">Debt score</span>
    </div>
  );
}

export default function ModuleDetailDrawer({ module, onClose }) {
  if (!module) return null;

  const reasons = (module.reasons || []).map((r) => ({
    name: r.feature,
    pct: r.contribution_pct,
    value: r.value,
  }));

  const metrics = [
    ["Cyclomatic", module.cyclomatic_complexity?.toFixed(2)],
    ["Cognitive", module.cognitive_complexity?.toFixed(2)],
    ["Churn (90d)", module.churn_90d],
    ["Test coverage", `${((module.test_coverage_ratio ?? 0) * 100).toFixed(0)}%`],
    ["LOC", module.lines_of_code],
    ["Functions", module.function_count],
    ["Max fn complexity", module.max_fn_complexity],
    ["Fan-out", module.fan_out],
  ];

  const risk = module.risk_level || "low";

  return (
    <>
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside className="drawer-panel">
        <header className="drawer-header">
          <div>
            <span
              className="risk-badge"
              style={{ background: RISK_COLORS[risk] || RISK_COLORS.low }}
            >
              {risk}
            </span>
            <h3 className="drawer-title">{module.file_path}</h3>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>
            ×
          </button>
        </header>

        <DebtGauge score={module.debt_score} />

        <p className="roi-line">
          Est. refactor effort:{" "}
          <strong>~{module.roi_days?.toFixed(1) ?? "0"} days</strong>
        </p>

        {reasons.length > 0 && (
          <section className="drawer-section">
            <h4>Why this score (SHAP)</h4>
            <ResponsiveContainer width="100%" height={reasons.length * 44 + 16}>
              <BarChart
                data={reasons}
                layout="vertical"
                margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fill: "#8b9cb3", fontSize: 11 }}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={18}>
                  {reasons.map((_, i) => (
                    <Cell key={i} fill="#3b82f6" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ul className="reason-list">
              {reasons.map((r) => (
                <li key={r.name}>
                  {r.name} ({r.value}) — {r.pct}% of score
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="drawer-section">
          <h4>Raw metrics</h4>
          <dl className="metrics-dl">
            {metrics.map(([label, val]) => (
              <div key={label} className="metrics-row">
                <dt>{label}</dt>
                <dd>{val ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </aside>
    </>
  );
}
