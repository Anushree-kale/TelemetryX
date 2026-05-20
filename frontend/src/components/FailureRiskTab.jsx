import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";

const POLL_INTERVAL_MS = 2000;

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div
        className="custom-tooltip"
        style={{
          background: "#121b26",
          border: "1px solid #233041",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          color: "#f1f5f9",
          padding: "8px 12px",
          fontSize: "0.82rem",
          maxWidth: 320,
        }}
      >
        <p style={{ margin: 0, fontWeight: 600, color: "#f8fafc", wordBreak: "break-all" }}>
          {data.fullPath}
        </p>
        <div style={{ marginTop: 6 }}>
          <strong>Failure Likelihood:</strong> {(data.riskScore * 100).toFixed(1)}%
        </div>
        <div>
          <strong>Risk Category:</strong>{" "}
          <span
            style={{
              color:
                data.riskLevel === "high"
                  ? "#fca5a5"
                  : data.riskLevel === "medium"
                  ? "#fde047"
                  : "#a7f3d0",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {data.riskLevel}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default function FailureRiskTab({ jobId, apiBase }) {
  const [predictions, setPredictions] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let timerId = null;

    const fetchPredictions = async () => {
      try {
        const res = await fetch(`${apiBase}/jobs/${jobId}/failure-risk`);
        if (!res.ok) {
          throw new Error(`Failed to fetch failure predictions: ${res.statusText}`);
        }
        const data = await res.json();
        
        setStatus(data.status);
        if (data.status === "complete") {
          setPredictions(data.predictions || []);
          setLoading(false);
        } else {
          // Keep polling if status is still pending
          timerId = setTimeout(fetchPredictions, POLL_INTERVAL_MS);
        }
      } catch (err) {
        setError(err.message || "An error occurred fetching predictions");
        setLoading(false);
      }
    };

    fetchPredictions();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [jobId, apiBase]);

  // Sort and filter top 10 modules by risk score
  const topRiskData = useMemo(() => {
    return [...predictions]
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 10)
      .map((p) => ({
        name: p.file_path.split("/").pop(),
        fullPath: p.file_path,
        riskScore: p.risk_score,
        riskLevel: p.risk_level,
      }));
  }, [predictions]);

  if (loading && status === "pending") {
    return (
      <div className="failure-risk-loading" style={{ padding: "2rem", textAlign: "center" }}>
        <div className="spinner" style={{ marginBottom: "1rem" }}>⏳</div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
          Running LSTM failure predictor model on metrics sequences…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="failure-risk-error" style={{ padding: "2rem", color: "#f87171" }}>
        <p>⚠️ Error: {error}</p>
      </div>
    );
  }

  const getRiskBadgeStyles = (level) => {
    switch (level) {
      case "high":
        return {
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid #ef4444",
          color: "#fca5a5",
        };
      case "medium":
        return {
          background: "rgba(245, 158, 11, 0.15)",
          border: "1px solid #f59e0b",
          color: "#fde047",
        };
      default:
        return {
          background: "rgba(16, 185, 129, 0.15)",
          border: "1px solid #10b981",
          color: "#a7f3d0",
        };
    }
  };

  const getRiskColor = (score) => {
    if (score >= 0.7) return "#ef4444";
    if (score >= 0.4) return "#f59e0b";
    return "#10b981";
  };

  return (
    <div className="failure-risk-tab">
      <p className="card-hint" style={{ marginBottom: "1.5rem" }}>
        This LSTM failure model evaluates the trend of code churn, cyclomatic complexity, and commit frequency across historical commits. It highlights files at high risk of regression or immediate failure.
      </p>

      {predictions.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
          No files analyzed in this job.
        </div>
      ) : (
        <>
          <div className="card" style={{ background: "#0f141a", border: "1px solid #1a222d", marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "#f8fafc" }}>
              Top 10 Highest Risk Modules
            </h3>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={topRiskData}
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 1]}
                    tickFormatter={(tick) => `${(tick * 100).toFixed(0)}%`}
                    stroke="#64748b"
                    fontSize={11}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={11}
                    width={100}
                    tickFormatter={(name) => (name.length > 15 ? `${name.slice(0, 13)}…` : name)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="riskScore" radius={[0, 4, 4, 0]} barSize={16}>
                    {topRiskData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getRiskColor(entry.riskScore)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ background: "#0f141a", border: "1px solid #1a222d" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "#f8fafc" }}>
              Failure Risk Directory ({predictions.length} modules)
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table className="inventory-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #1e293b" }}>
                    <th style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.85rem" }}>
                      Module Path
                    </th>
                    <th style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.85rem", width: "120px" }}>
                      Risk Level
                    </th>
                    <th style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.85rem", width: "150px" }}>
                      Failure Likelihood
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => (
                    <tr key={p.id || p.module_id} style={{ borderBottom: "1px solid #151f2b" }}>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "#cbd5e1",
                          fontSize: "0.85rem",
                          fontFamily: "monospace",
                          wordBreak: "break-all",
                        }}
                      >
                        {p.file_path}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span
                          style={{
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            display: "inline-block",
                            ...getRiskBadgeStyles(p.risk_level),
                          }}
                        >
                          {p.risk_level}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: getRiskColor(p.risk_score),
                          fontWeight: 600,
                          fontSize: "0.9rem",
                        }}
                      >
                        {(p.risk_score * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
