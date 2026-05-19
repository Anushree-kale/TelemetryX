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
        <CartesianGrid strokeDasharray="3 3" stroke="#e8ddd0" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#7a6b5c", fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
          height={70}
        />
        <YAxis tick={{ fill: "#7a6b5c", fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            background: "#fff9f2",
            border: "1px solid #e8ddd0",
            borderRadius: 6,
            color: "#2d2419",
          }}
          labelStyle={{ color: "#2d2419" }}
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
