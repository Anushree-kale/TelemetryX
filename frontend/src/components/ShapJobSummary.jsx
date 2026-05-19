import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function ShapJobSummary({ jobId, apiBase }) {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/jobs/${jobId}/shap-summary`);
      if (!res.ok) throw new Error("Could not load SHAP summary");
      const data = await res.json();
      const list = (data.features || []).map((f) => ({
        name: f.feature,
        total: Number(f.total_abs_shap ?? 0),
        modules: f.module_count,
        avgPct: Number(f.avg_contribution_pct ?? 0),
      }));
      setFeatures(list);
    } catch (e) {
      setError(e.message);
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [jobId, apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  if (!jobId) return null;

  if (loading) {
    return (
      <div className="card">
        <h2>Repo-wide SHAP drivers</h2>
        <p className="card-hint">Loading aggregated explanations…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Repo-wide SHAP drivers</h2>
        <p className="card-hint">⚠️ {error}</p>
      </div>
    );
  }

  if (features.length === 0) {
    return (
      <div className="card">
        <h2>Repo-wide SHAP drivers</h2>
        <p className="card-hint">
          No SHAP rows stored for this job yet. Re-run analysis after the debt model has
          trained successfully.
        </p>
      </div>
    );
  }

  const maxT = Math.max(...features.map((f) => f.total), 0.0001);
  const chartData = features.map((f) => ({
    ...f,
    norm: Math.round((f.total / maxT) * 100),
  }));

  return (
    <div className="card shap-job-card">
      <h2>Repo-wide SHAP drivers</h2>
      <p className="card-hint">
        Features ranked by total absolute SHAP impact across all modules in this scan
        (which signals move the model most often).
      </p>
      <div style={{ height: Math.min(420, features.length * 28 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={200}
              tick={{ fill: "#8b9cb3", fontSize: 11 }}
            />
            <Tooltip
              formatter={(_v, _n, props) => {
                const p = props.payload;
                return [
                  `Σ|SHAP|=${p.total.toFixed(3)} · modules=${p.modules} · avg top-3 %=${p.avgPct.toFixed(1)}`,
                  p.name,
                ];
              }}
              contentStyle={{ background: "#1a2332", border: "1px solid #2a3548" }}
            />
            <Bar dataKey="norm" radius={[0, 4, 4, 0]} barSize={16}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="#6366f1" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
