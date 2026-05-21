import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 2000;

export default function TeamHealthTab({ jobId, apiBase }) {
  const [assessment, setAssessment] = useState(null);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let timerId = null;

    const fetchBurnout = async () => {
      try {
        const res = await fetch(`${apiBase}/jobs/${jobId}/burnout`);
        if (!res.ok) {
          throw new Error(`Failed to fetch burnout assessment: ${res.statusText}`);
        }
        const data = await res.json();
        
        setStatus(data.status);
        if (data.status === "complete") {
          setAssessment(data);
          setLoading(false);
        } else {
          timerId = setTimeout(fetchBurnout, POLL_INTERVAL_MS);
        }
      } catch (err) {
        setError(err.message || "An error occurred fetching burnout assessment");
        setLoading(false);
      }
    };

    fetchBurnout();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [jobId, apiBase]);

  if (loading && status === "pending") {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <div className="spinner" style={{ marginBottom: "1rem" }}>⏳</div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
          Running Burnout Radar classifier on cohort metrics…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", color: "#f87171" }}>
        <p>⚠️ Error: {error}</p>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
        No team health data available for this job.
      </div>
    );
  }

  const { risk_level, risk_score, top_drivers, metrics } = assessment;

  const getRiskColor = (level) => {
    switch (level?.toLowerCase()) {
      case "high": return "#ef4444";
      case "medium": return "#f59e0b";
      case "low": return "#10b981";
      default: return "#64748b";
    }
  };

  const riskColor = getRiskColor(risk_level);
  const scorePct = (risk_score * 100).toFixed(1);
  const circleCircumference = 2 * Math.PI * 45; // r=45
  const strokeDashoffset = circleCircumference - (risk_score * circleCircumference);

  return (
    <div className="team-health-tab">
      <p className="card-hint" style={{ marginBottom: "1.5rem" }}>
        Burnout Radar predicts cohort-level burnout risk using an XGBoost classifier based on concentration risk, firefighting ratios, and activity pressure.
      </p>

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        {/* Risk Gauge */}
        <div className="team-health-widget" style={{ flex: "1 1 300px", background: "var(--bg-card)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>Burnout Risk</h3>
          
          <div style={{ position: "relative", width: "120px", height: "120px" }}>
            <svg width="120" height="120" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="8" />
              <circle 
                cx="50" cy="50" r="45" 
                fill="none" 
                stroke={riskColor} 
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
              />
            </svg>
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "1.5rem", fontWeight: "bold", color: riskColor }}>{scorePct}%</span>
            </div>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <span style={{
              padding: "0.3rem 0.8rem",
              borderRadius: "4px",
              fontSize: "0.85rem",
              fontWeight: 600,
              textTransform: "uppercase",
              background: `${riskColor}22`,
              border: `1px solid ${riskColor}`,
              color: riskColor
            }}>
              {risk_level} RISK
            </span>
          </div>
        </div>

        {/* Top Drivers */}
        <div className="team-health-widget" style={{ flex: "2 1 400px", background: "var(--bg-card)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>Contributing Factors</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {top_drivers && top_drivers.map((d, i) => (
              <li key={i} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: i < top_drivers.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <strong style={{ color: "var(--text)" }}>{d.label}</strong>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{d.display_value}</span>
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  SHAP Contribution: {d.shap_value > 0 ? "+" : ""}{d.shap_value.toFixed(3)}
                </div>
              </li>
            ))}
            {(!top_drivers || top_drivers.length === 0) && (
              <li style={{ color: "var(--text-muted)" }}>No primary drivers identified.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="team-health-widget" style={{ background: "var(--bg-card)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>Team-Cohort Metrics</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.75rem", color: "var(--text-muted)" }}>Metric</th>
                <th style={{ padding: "0.75rem", color: "var(--text-muted)" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {metrics && Object.entries(metrics).map(([key, val], i) => (
                <tr key={key} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.75rem", color: "var(--text)", fontFamily: "monospace" }}>{key}</td>
                  <td style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>
                    {typeof val === 'number' ? (key.includes("pct") || key.includes("ratio") ? `${(val*100).toFixed(1)}%` : val.toFixed(1)) : val}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
