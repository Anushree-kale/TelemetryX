import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatScanLabel(row, index) {
  if (row.created_at) {
    try {
      const d = new Date(row.created_at);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      /* fall through */
    }
  }
  return `#${index + 1}`;
}

export default function HistoryTrends({ repoUrl, apiBase }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoUrl) {
      setRows([]);
      return;
    }
    setLoading(true);
    fetch(`${apiBase}/jobs/history?repo_url=${encodeURIComponent(repoUrl)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const chartData = data.map((h, i) => ({
            label: formatScanLabel(h, i),
            scanId: h.id,
            avgDebt: Number(h.avg_debt_score ?? 0),
            highRisk: Number(h.high_risk_count ?? 0),
            totalLoc: Number(h.total_loc ?? 0),
            coveragePct: Number((h.avg_test_coverage ?? 0) * 100),
            fileCount: Number(h.file_count ?? 0),
          }));
          setRows(chartData);
        } else {
          setRows([]);
        }
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [repoUrl, apiBase]);

  if (!repoUrl) return null;

  if (loading) {
    return (
      <div className="card">
        <h2>Historical trends</h2>
        <p className="card-hint">Loading scan history…</p>
      </div>
    );
  }

  if (rows.length < 2) {
    return (
      <div className="card">
        <h2>Historical trends</h2>
        <p className="card-hint">
          Complete at least two analyses of this repository to see debt, risk count, and test-file
          ratio trends over time.
        </p>
      </div>
    );
  }

  return (
    <div className="card trends-card">
      <h2>Historical trends</h2>
      <p className="card-hint">
        Per-scan aggregates from completed jobs for this repository (same data as summary
        sparklines, shown at full width).
      </p>
      <div className="trends-chart-block">
        <h3 className="trends-subtitle">Debt &amp; high-risk count</h3>
        <div className="trends-chart" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
              <XAxis dataKey="label" tick={{ fill: "#8b9cb3", fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: "#8b9cb3", fontSize: 11 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "#8b9cb3", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ background: "#1a2332", border: "1px solid #2a3548" }}
                labelStyle={{ color: "#e7ecf3" }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="avgDebt"
                name="Avg debt"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="highRisk"
                name="High-risk files"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="trends-chart-block">
        <h3 className="trends-subtitle">Scale &amp; test file ratio</h3>
        <div className="trends-chart" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
              <XAxis dataKey="label" tick={{ fill: "#8b9cb3", fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: "#8b9cb3", fontSize: 11 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "#8b9cb3", fontSize: 11 }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{ background: "#1a2332", border: "1px solid #2a3548" }}
                labelStyle={{ color: "#e7ecf3" }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="totalLoc"
                name="Total LOC"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="coveragePct"
                name="Avg test file ratio %"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="card-hint small muted">
          “Avg test file ratio %” is test-line volume ÷ source-line volume per scan—not JaCoCo or
          pytest-cov coverage.
        </p>
        <p className="card-hint small muted">
          Module count per scan: {rows.map((r) => r.fileCount).join(" → ")}
        </p>
      </div>
    </div>
  );
}
