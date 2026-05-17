import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function MetricsChart({ modules }) {
  const chartData = [...modules]
    .sort((a, b) => b.cyclomatic_complexity - a.cyclomatic_complexity)
    .slice(0, 10)
    .map((m) => ({
      name: m.file_path.split("/").pop(),
      fullPath: m.file_path,
      cyclomatic: m.cyclomatic_complexity,
    }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3548" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#8b9cb3", fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
          height={70}
        />
        <YAxis tick={{ fill: "#8b9cb3", fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            background: "#1a2332",
            border: "1px solid #2a3548",
            borderRadius: 6,
          }}
          labelStyle={{ color: "#e7ecf3" }}
          formatter={(value) => [value, "Cyclomatic"]}
          labelFormatter={(_, payload) =>
            payload?.[0]?.payload?.fullPath ?? ""
          }
        />
        <Bar dataKey="cyclomatic" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
