import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionHint } from "./appPrimitives";
import { SHAP_PLAIN } from "../labels";

const FEATURE_PLAIN = SHAP_PLAIN;

function aggregateDrivers(modules) {
  const byFeature = new Map();
  for (const mod of modules) {
    for (const r of mod.reasons || []) {
      const name = r.feature;
      const existing = byFeature.get(name) || {
        name,
        total: 0,
        modules: 0,
        pctSum: 0,
      };
      existing.total += Math.abs(Number(r.shap_value ?? 0));
      existing.pctSum += Number(r.contribution_pct ?? 0);
      existing.modules += 1;
      byFeature.set(name, existing);
    }
  }
  return [...byFeature.values()]
    .map((f) => ({
      name: f.name,
      total: f.total,
      modules: f.modules,
      avgPct: f.modules ? f.pctSum / f.modules : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function formatShapTooltip(payload) {
  const p = payload;
  const plain = FEATURE_PLAIN[p.name] || "a signal the debt model leans on";
  const topShare = p.avgPct?.toFixed(1) ?? "0";
  return [
    `${p.name} (${plain}) is the strongest contributor in roughly ${topShare}% of the typical file's top-3 explanation (across ${p.modules} files in this scan). Total influence magnitude: ${p.total.toFixed(3)} (model-internal units).`,
    "Model drivers",
  ];
}

export default function ShapJobSummary({ modules = [] }) {
  const features = useMemo(() => aggregateDrivers(modules), [modules]);

  if (!modules.length) return null;

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
