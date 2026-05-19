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
import SectionHint from "./SectionHint";
import { SHAP_PLAIN } from "../friendlyLabels";

const FEATURE_PLAIN = SHAP_PLAIN;

function formatShapTooltip(payload) {
  const p = payload;
  const plain = FEATURE_PLAIN[p.name] || "a signal the debt model leans on";
  const topShare = p.avgPct?.toFixed(1) ?? "0";
  return [
    `${p.name} (${plain}) is the strongest contributor in roughly ${topShare}% of the typical file’s top-3 explanation (across ${p.modules} files in this scan). Total influence magnitude: ${p.total.toFixed(3)} (model-internal units).`,
    "Model drivers",
  ];
}

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
      if (!res.ok) throw new Error("Could not load driver summary");
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
        <h2>What makes files messy here?</h2>
        <p className="card-hint">Loading aggregated explanations…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>What makes files messy here?</h2>
        <p className="status error">⚠️ {error}</p>
      </div>
    );
  }

  if (features.length === 0) {
    return (
      <div className="card">
        <h2>What makes files messy here?</h2>
        <p className="card-hint">
          No explanation rows stored for this job yet. Re-run analysis after the debt model has
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
      <div className="card-heading-row">
        <h2>What makes files messy here?</h2>
        <SectionHint label="How to read this chart">
          <p>
            The model estimates each file&apos;s debt from measurable signals (complexity, size,
            churn, test-file ratio, etc.). This chart ranks which signals had the largest combined
            influence across files. Hover a bar for a plain-English sentence; numbers are for
            comparison between signals, not dollar values.
          </p>
        </SectionHint>
      </div>
      <p className="card-hint">
        Bars compare how much each signal mattered when explaining debt across modules (SHAP
        feature attribution).
      </p>
      <div className="shap-chart-height" style={{ height: Math.min(420, features.length * 28 + 40) }}>
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
              formatter={(_v, _n, props) => formatShapTooltip(props.payload)}
              contentStyle={{ background: "#1a2332", border: "1px solid #2a3548", maxWidth: 360 }}
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
