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
      <p className="gauge-sublabel">
        0 = healthiest, 100 = strongest rework pressure (model estimate)
      </p>
    </div>
  );
}

function formatBugFixRatio(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (n <= 1 && n >= 0) return `${(n * 100).toFixed(0)}%`;
  return `${n.toFixed(0)}%`;
}

function topCoChanges(coChanges, limit = 12) {
  if (!coChanges || typeof coChanges !== "object") return [];
  return Object.entries(coChanges)
    .map(([path, count]) => ({ path, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export default function ModuleDetailDrawer({ module, onClose }) {
  if (!module) return null;

  const reasons = (module.reasons || []).map((r) => ({
    name: r.feature,
    pct: r.contribution_pct,
    value: r.value ?? r.display_value,
    shap_value: r.shap_value,
  }));

  const metrics = [
    ["Cyclomatic", module.cyclomatic_complexity?.toFixed(2)],
    ["Cognitive", module.cognitive_complexity?.toFixed(2)],
    ["Churn (90d)", module.churn_90d],
    ["Test file ratio (lines in tests ÷ lines in source)", `${((module.test_coverage_ratio ?? 0) * 100).toFixed(0)}%`],
    ["LOC", module.lines_of_code],
    ["Functions", module.function_count],
    ["Max fn complexity", module.max_fn_complexity],
    ["Fan-out", module.fan_out],
  ];

  const gitMetrics = [
    ["Unique authors", module.unique_author_count],
    ["Top author share", module.top_author_pct != null ? `${Number(module.top_author_pct).toFixed(0)}%` : "—"],
    ["Bug-fix commit ratio", formatBugFixRatio(module.bug_fix_ratio)],
    ["Days since last commit", module.days_since_last_commit],
  ];

  const graphMetrics = [
    ["In-degree", module.in_degree],
    ["Out-degree", module.out_degree],
    ["Betweenness", module.betweenness != null ? Number(module.betweenness).toFixed(4) : "—"],
    ["Downstream reach", module.downstream_count],
    ["Cluster", module.cluster_id],
    ["Priority score", module.priority_score != null ? module.priority_score.toFixed(1) : "—"],
    ["Critical (roadmap)", module.is_critical ? "Yes" : "No"],
  ];

  const importsStr = module.imports != null ? String(module.imports).trim() : "";
  const importsPreview = importsStr
    ? importsStr.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 25)
    : [];

  const coList = topCoChanges(module.co_changes);

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

        {module.summary && (
          <section className="drawer-section">
            <h4>Why is this risky?</h4>
            <p className="drawer-summary-text">{module.summary}</p>
          </section>
        )}

        {reasons.length > 0 && (
          <section className="drawer-section">
            <h4>Top model drivers</h4>
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
                  <strong>{r.name}</strong> ({r.value}) — {r.pct}% of local score
                  {r.shap_value != null && (
                    <span className="muted small">
                      {" "}
                      · raw SHAP {Number(r.shap_value) > 0 ? "+" : ""}
                      {Number(r.shap_value).toFixed(3)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="drawer-section">
          <h4>Git activity</h4>
          <dl className="metrics-dl">
            {gitMetrics.map(([label, val]) => (
              <div key={label} className="metrics-row">
                <dt>{label}</dt>
                <dd>{val ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="drawer-section">
          <h4>Graph &amp; prioritization</h4>
          <dl className="metrics-dl">
            {graphMetrics.map(([label, val]) => (
              <div key={label} className="metrics-row">
                <dt>{label}</dt>
                <dd>{val ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        {importsPreview.length > 0 && (
          <section className="drawer-section">
            <h4>Imports (sample)</h4>
            <ul className="drawer-imports-list">
              {importsPreview.map((imp) => (
                <li key={imp}>
                  <code>{imp}</code>
                </li>
              ))}
            </ul>
            {importsStr.split(",").length > importsPreview.length && (
              <p className="muted small">Showing first {importsPreview.length} of many.</p>
            )}
          </section>
        )}

        {coList.length > 0 && (
          <section className="drawer-section">
            <h4>Co-change partners</h4>
            <p className="muted small">
              Files that often change in the same commit as this module.
            </p>
            <ul className="drawer-cochanges">
              {coList.map((row) => (
                <li key={row.path}>
                  <code>{row.path}</code>
                  <span className="co-count">{row.count}×</span>
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
