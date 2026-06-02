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
        <p style={{ color: "#8b9cb3", fontSize: "0.95rem" }}>
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
      <div style={{ padding: "2rem", textAlign: "center", color: "#8b9cb3" }}>
        No team health data available for this job.
      </div>
    );
  }

  const { risk_level, risk_score, top_drivers, metrics, model_info: modelInfo } = assessment;

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

      {modelInfo && (
        <div
          className="card-hint"
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem 1rem",
            borderRadius: "6px",
            border: "1px solid #2a3548",
            background: "#121a28",
            fontSize: "0.85rem",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "#e7ecf3" }}>Model provenance: </strong>
          {modelInfo.training_source === "labeled_validation" ? (
            <span>Trained on anonymized labeled cohort data.</span>
          ) : (
            <span>Trained on synthetic cohort data (heuristic labels).</span>
          )}
          {modelInfo.validation_metrics ? (
            <span>
              {" "}
              Hold-out validation ({modelInfo.validation_metrics.n_samples} rows): accuracy{" "}
              {(modelInfo.validation_metrics.accuracy * 100).toFixed(1)}%
              {modelInfo.validation_metrics.roc_auc != null && (
                <>
                  , ROC-AUC {(modelInfo.validation_metrics.roc_auc * 100).toFixed(1)}%
                </>
              )}
              .
            </span>
          ) : (
            <span>
              {" "}
              Add ≥5 anonymized labeled rows to <code>backend/data/burnout_validation.csv</code> for
              hold-out metrics; ≥30 rows enables retraining on real labels.
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        {/* Risk Gauge */}
        <div className="team-health-widget" style={{ flex: "1 1 300px", background: "#1a2332", padding: "1.5rem", borderRadius: "8px", border: "1px solid #2a3548", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", color: "#e7ecf3" }}>Burnout Risk</h3>
          
          <div style={{ position: "relative", width: "120px", height: "120px" }}>
            <svg width="120" height="120" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#2a3548" strokeWidth="8" />
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
        <div className="team-health-widget" style={{ flex: "2 1 400px", background: "#1a2332", padding: "1.5rem", borderRadius: "8px", border: "1px solid #2a3548" }}>
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", color: "#e7ecf3" }}>Contributing Factors</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {top_drivers && top_drivers.map((d, i) => (
              <li key={i} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: i < top_drivers.length - 1 ? "1px solid #2a3548" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                  <strong style={{ color: "#e7ecf3" }}>{d.label}</strong>
                  <span style={{ fontWeight: 600, color: "#c5d0e0" }}>{d.display_value}</span>
                </div>
                <div style={{ fontSize: "0.85rem", color: "#8b9cb3" }}>
                  SHAP Contribution: {d.shap_value > 0 ? "+" : ""}{d.shap_value.toFixed(3)}
                </div>
              </li>
            ))}
            {(!top_drivers || top_drivers.length === 0) && (
              <li style={{ color: "#8b9cb3" }}>No primary drivers identified.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="team-health-widget" style={{ background: "#1a2332", padding: "1.5rem", borderRadius: "8px", border: "1px solid #2a3548" }}>
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", color: "#e7ecf3" }}>Team-Cohort Metrics</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2a3548" }}>
                <th style={{ padding: "0.75rem", color: "#8b9cb3" }}>Metric</th>
                <th style={{ padding: "0.75rem", color: "#8b9cb3" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {metrics && Object.entries(metrics).map(([key, val], i) => (
                <tr key={key} style={{ borderBottom: "1px solid #1e2a3a" }}>
                  <td style={{ padding: "0.75rem", color: "#e7ecf3", fontFamily: "monospace" }}>{key}</td>
                  <td style={{ padding: "0.75rem", color: "#c5d0e0" }}>
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
