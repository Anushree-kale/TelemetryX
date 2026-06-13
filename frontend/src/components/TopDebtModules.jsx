import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function debtBarColor(score) {
  if (score >= 60) return "#ef4444";
  if (score >= 35) return "#f59e0b";
  return "#10b981";
}

/** Ranked bar chart of highest-debt modules — replaces the file heatmap tile grid. */
export default function TopDebtModules({ modules }) {
  const chartData = [...modules]
    .filter((m) => m.debt_score != null)
    .sort((a, b) => (b.debt_score ?? 0) - (a.debt_score ?? 0))
    .slice(0, 12)
    .map((m) => ({
      name: m.file_path.split("/").pop() || m.file_path,
      fullPath: m.file_path,
      debt: Number(m.debt_score),
      risk: m.risk_level,
    }));

  if (chartData.length === 0) {
    return (
      <p className="card-hint" style={{ margin: 0 }}>
        No debt scores available for this scan.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8ddd0" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: "#7a6b5c", fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: "#7a6b5c", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{
            background: "#fff9f2",
            border: "1px solid #e8ddd0",
            borderRadius: 6,
            color: "#2d2419",
          }}
          formatter={(value) => [value, "Debt score"]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullPath ?? ""}
        />
        <Bar dataKey="debt" radius={[0, 4, 4, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.fullPath} fill={debtBarColor(entry.debt)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
