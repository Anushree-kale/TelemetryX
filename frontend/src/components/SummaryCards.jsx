import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import SectionHint from "./SectionHint";

export default function SummaryCards({ modules, repoUrl, apiBase = "http://localhost:8000" }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!repoUrl) return;
    fetch(`${apiBase}/jobs/history?repo_url=${encodeURIComponent(repoUrl)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setHistory(data);
        }
      })
      .catch((err) => console.error("Error loading historical jobs:", err));
  }, [repoUrl, apiBase]);

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

  const highRiskCount = modules.filter((m) => m.risk_level === "high").length;

  const cards = [
    {
      label: "Files scanned",
      value: String(modules.length),
      sub: "Everything we looked at",
      sparklineData: history.map((h) => ({ value: h.file_count })),
      sparklineColor: "#e07a4a",
    },
    {
      label: "Avg mess score",
      value: avgDebt.toFixed(1),
      sub: "0–100 · higher = scarier to change",
      sparklineData: history.map((h) => ({ value: h.avg_debt_score })),
      sparklineColor: avgDebt >= 60 ? "#c94a4a" : avgDebt >= 35 ? "#d4920a" : "#3d8f5a",
    },
    {
      label: "High-alarm files",
      value: String(highRiskCount),
      sub: highest ? `Hottest: ${highest.debt_score?.toFixed(1)}` : "All chill",
      sparklineData: history.map((h) => ({ value: h.high_risk_count })),
      sparklineColor: "#d4920a",
    },
    {
      label: "Payoff if you fix reds",
      value: `~${highDebtRoi.toFixed(1)} days`,
      sub: "Rough dev-days for high-alarm files only",
      sparklineData: history.map((h) => ({ value: h.high_risk_count })),
      sparklineColor: "#7a6b5c",
    },
  ];

  return (
    <section className="summary-cards-section" aria-label="Repository snapshot">
      <div className="summary-grid-heading">
        <h2 className="summary-grid-title">The numbers</h2>
        <SectionHint label="Reading these cards">
          <p>
            <strong>Mess score</strong> (0–100): how risky a file feels to change.{" "}
            <strong>High-alarm</strong> = same thresholds as the file table.{" "}
            <strong>Payoff days</strong> = rough estimate if you tackle red files first — not a
            sprint commitment.
          </p>
        </SectionHint>
      </div>
      <div className="summary-grid">
        {cards.map((c) => (
          <div key={c.label} className="summary-card flex-col">
            <div className="flex justify-between items-start w-full">
              <div className="flex flex-col">
                <span className="summary-label">{c.label}</span>
                <span className="summary-value">{c.value}</span>
              </div>
              {c.sub && <span className="summary-sub text-right">{c.sub}</span>}
            </div>
            {history.length >= 2 && c.sparklineData && c.sparklineData.length >= 2 && (
              <div className="sparkline-wrapper" style={{ width: "100%", height: 35, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={c.sparklineData}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={c.sparklineColor}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
