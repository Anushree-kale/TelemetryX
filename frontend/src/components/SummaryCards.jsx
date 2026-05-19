import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line } from "recharts";

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
      label: "Modules analyzed",
      value: String(modules.length),
      sub: "Total files parsed",
      sparklineData: history.map((h) => ({ value: h.file_count })),
      sparklineColor: "#3b82f6", // blue
    },
    {
      label: "Avg debt score",
      value: avgDebt.toFixed(1),
      sub: "0–100 scale",
      sparklineData: history.map((h) => ({ value: h.avg_debt_score })),
      sparklineColor: avgDebt >= 60 ? "#ef4444" : avgDebt >= 35 ? "#f59e0b" : "#10b981",
    },
    {
      label: "High risk modules",
      value: String(highRiskCount),
      sub: highest ? `Max score: ${highest.debt_score?.toFixed(1)}` : "None",
      sparklineData: history.map((h) => ({ value: h.high_risk_count })),
      sparklineColor: "#f59e0b", // amber
    },
    {
      label: "Est. refactor days (high risk)",
      value: `~${highDebtRoi.toFixed(1)}`,
      sub: "Cumulative high-debt ROI",
      sparklineData: history.map((h) => ({ value: h.avg_test_coverage * 100 })), // coverage trend sparkline!
      sparklineColor: "#10b981", // green
    },
  ];

  return (
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
  );
}
