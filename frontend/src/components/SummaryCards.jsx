export default function SummaryCards({ modules }) {
  if (!modules.length) return null;

  const withScore = modules.filter((m) => m.debt_score != null);
  const avgDebt =
    withScore.length > 0
      ? withScore.reduce((s, m) => s + m.debt_score, 0) / withScore.length
      : 0;

  const highest = [...withScore].sort(
    (a, b) => (b.debt_score ?? 0) - (a.debt_score ?? 0),
  )[0];

  const highDebtRoi = modules
    .filter((m) => m.risk_level === "high")
    .reduce((s, m) => s + (m.roi_days ?? 0), 0);

  const cards = [
    {
      label: "Modules analyzed",
      value: String(modules.length),
      sub: null,
    },
    {
      label: "Avg debt score",
      value: avgDebt.toFixed(1),
      sub: "0–100 scale",
    },
    {
      label: "Highest risk file",
      value: highest
        ? highest.file_path.split("/").pop()
        : "—",
      sub: highest ? `Score ${highest.debt_score?.toFixed(1)}` : null,
    },
    {
      label: "Est. refactor days (high risk)",
      value: `~${highDebtRoi.toFixed(1)}`,
      sub: "sum of ROI across high-debt modules",
    },
  ];

  return (
    <div className="summary-grid">
      {cards.map((c) => (
        <div key={c.label} className="summary-card">
          <span className="summary-label">{c.label}</span>
          <span className="summary-value">{c.value}</span>
          {c.sub && <span className="summary-sub">{c.sub}</span>}
        </div>
      ))}
    </div>
  );
}
