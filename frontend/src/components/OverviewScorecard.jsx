import { useEffect, useState } from "react";
import SectionHint from "./SectionHint";

const CircularGauge = ({ percentage, color, label }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage * circumference);

  return (
    <div style={{ position: "relative", width: "90px", height: "90px", flexShrink: 0 }}>
      <svg width="90" height="90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#2a3548" strokeWidth="6" />
        <circle 
          cx="50" cy="50" r="40" 
          fill="none" 
          stroke={color} 
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
        />
      </svg>
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#e7ecf3" }}>{label}</span>
      </div>
    </div>
  );
};

export default function OverviewScorecard({
  modules,
  repoUrl,
  jobId,
  apiBase = "http://localhost:8000",
  onNavigate,
}) {
  const [history, setHistory] = useState([]);
  const [privacyComparison, setPrivacyComparison] = useState(null);

  useEffect(() => {
    if (!repoUrl) return;
    fetch(`${apiBase}/jobs/history?repo_url=${encodeURIComponent(repoUrl)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setHistory(data);
          const currentJob = data.length > 0 ? data[data.length - 1] : null;
          if (currentJob && currentJob.privacy_mode) {
             fetch(`${apiBase}/jobs/${currentJob.id}/privacy-comparison`)
               .then(r => r.json())
               .then(d => {
                 if (d.comparisons && d.comparisons.length > 0) {
                   setPrivacyComparison(d.comparisons);
                 } else {
                   setPrivacyComparison(null);
                 }
               })
               .catch(() => setPrivacyComparison(null));
          } else {
             setPrivacyComparison(null);
          }
        }
      })
      .catch((err) => console.error("Error loading historical jobs:", err));
  }, [repoUrl, apiBase]);

  if (!modules.length) return null;

  const withScore = modules.filter((m) => m.debt_score != null);
  const avgDebt =
    withScore.length > 0
      ? withScore.reduce((s, m) => s + Number(m.debt_score), 0) / withScore.length
      : 0;

  const highDebtRoi = modules
    .filter((m) => m.risk_level === "high")
    .reduce((s, m) => s + (m.roi_days ?? 0), 0);

  const historyIndex = jobId ? history.findIndex((h) => h.id === jobId) : -1;
  const currentJob =
    historyIndex >= 0
      ? history[historyIndex]
      : history.length > 0
        ? history[history.length - 1]
        : null;
  const previousJob =
    historyIndex > 0
      ? history[historyIndex - 1]
      : history.length > 1
        ? history[history.length - 2]
        : null;

  const failureRisk = currentJob?.avg_failure_risk || 0;
  const prevFailureRisk = previousJob?.avg_failure_risk || 0;

  const burnoutSignal = currentJob?.burnout_score || 0;
  const prevBurnoutSignal = previousJob?.burnout_score || 0;
  
  const prevAvgDebt = previousJob?.avg_debt_score || avgDebt;
  const prevHighDebtRoi = previousJob?.high_risk_roi || highDebtRoi;

  const renderTrendArrow = (current, previous, isHigherWorse = true) => {
    if (Math.abs(current - previous) < 0.01) {
      return <span style={{ color: "#8b9cb3", marginLeft: "4px" }}>→</span>;
    }
    const isIncrease = current > previous;
    const isBad = isHigherWorse ? isIncrease : !isIncrease;
    return (
      <span style={{ color: isBad ? "#ef4444" : "#10b981", marginLeft: "4px" }}>
        {isIncrease ? "▲" : "▼"}
      </span>
    );
  };

  const getDebtColor = (val) => val >= 60 ? "#ef4444" : val >= 35 ? "#f59e0b" : "#10b981";
  const getRiskColor = (val) => val >= 0.7 ? "#ef4444" : val >= 0.4 ? "#f59e0b" : "#10b981";

  const cards = [
    {
      id: "failure",
      title: "Failure Risk",
      hint: "LSTM average prediction score for failure and bugs.",
      value: failureRisk,
      percentage: failureRisk,
      label: `${(failureRisk * 100).toFixed(0)}%`,
      color: getRiskColor(failureRisk),
      trend: renderTrendArrow(failureRisk, prevFailureRisk, true)
    },
    {
      id: "files",
      title: "Debt Score",
      hint: withScore.length
        ? "Average module-level technical debt (XGBoost model)."
        : "Debt scores not available — ensure analysis completed and Celery worker ran.",
      value: avgDebt,
      percentage: avgDebt / 100,
      label: withScore.length ? avgDebt.toFixed(0) : "—",
      color: withScore.length ? getDebtColor(avgDebt) : "#64748b",
      trend: withScore.length ? renderTrendArrow(avgDebt, prevAvgDebt, true) : null,
    },
    {
      id: "teamhealth",
      title: "Burnout Signal",
      hint: "Burnout radar cohort-level classification.",
      value: burnoutSignal,
      percentage: burnoutSignal,
      label: `${(burnoutSignal * 100).toFixed(0)}%`,
      color: getRiskColor(burnoutSignal),
      trend: renderTrendArrow(burnoutSignal, prevBurnoutSignal, true)
    },
    {
      id: "fixes",
      title: "Fix ROI",
      hint: "Sum of high-risk modules' remediation effort in days.",
      value: highDebtRoi,
      percentage: Math.min(highDebtRoi / 100, 1),
      label: highDebtRoi > 0 ? `${highDebtRoi.toFixed(0)}d` : '0d',
      color: "#8b5cf6",
      trend: renderTrendArrow(highDebtRoi, prevHighDebtRoi, true)
    }
  ];

  return (
    <section className="overview-scorecard-section" aria-label="Unified Scorecard">
      <div className="summary-grid-heading" style={{ marginBottom: "1rem" }}>
        <h2 className="summary-grid-title">Unified Risk Scorecard</h2>
        <SectionHint label="Scorecard">
          <p>
            Key executive indicators of repository health. Click on a quadrant to drill down into the respective detailed panel.
          </p>
        </SectionHint>
      </div>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
        {cards.map(card => (
          <div 
            key={card.id} 
            className="scorecard-quadrant"
            onClick={() => onNavigate(card.id)}
            style={{
              background: "#1a2332",
              border: "1px solid #2a3548",
              borderRadius: "12px",
              padding: "1.5rem",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.15)";
              e.currentTarget.style.borderColor = "#3b82f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
              e.currentTarget.style.borderColor = "#2a3548";
            }}
          >
            <CircularGauge percentage={card.percentage} color={card.color} label={card.label} />
            <div style={{ marginLeft: "1.5rem", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem", color: "#e7ecf3" }}>
                  {card.title}
                </h3>
                {card.trend}
              </div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#8b9cb3", lineHeight: 1.4 }}>
                {card.hint}
              </p>
            </div>
          </div>
        ))}
      </div>

      {privacyComparison && (
        <div style={{ marginTop: "2rem", padding: "1.5rem", borderRadius: "12px", background: "linear-gradient(145deg, #1e293b, #0f172a)", border: "1px solid #334155" }}>
          <h3 style={{ margin: "0 0 1rem 0", color: "#e2e8f0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>🛡️</span> Differential Privacy Anonymization
          </h3>
          <p style={{ fontSize: "0.9rem", color: "#94a3b8", marginBottom: "1.5rem" }}>
            Synthetic noise was applied to these metrics to protect developer privacy while preserving cohort-level ML signals.
          </p>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            {privacyComparison.map((comp, i) => (
              <div key={i} style={{ flex: "1 1 200px", background: "#1e293b", padding: "1rem", borderRadius: "8px", border: "1px dashed #475569" }}>
                <div style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                  {comp.metric}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ textDecoration: "line-through", color: "#ef4444", fontWeight: "600" }}>{comp.real}</div>
                  <div style={{ color: "#8b9cb3" }}>→</div>
                  <div style={{ color: "#10b981", fontWeight: "bold", fontSize: "1.1rem" }}>{comp.transmitted}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
