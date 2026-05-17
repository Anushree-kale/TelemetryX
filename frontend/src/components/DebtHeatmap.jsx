import { ResponsiveContainer, Tooltip, Treemap } from "recharts";

function debtColor(score) {
  if (score == null) return "#64748b";
  if (score >= 70) return "#ef4444";
  if (score >= 40) return "#f59e0b";
  return "#22c55e";
}

function TreemapNode(props) {
  const { x, y, width, height, name, debtScore, loc, fullPath } = props;
  if (width < 2 || height < 2) return null;

  const label =
    name && name.length > 18 ? `${name.slice(0, 16)}…` : name;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={debtColor(debtScore)}
        stroke="#0f1419"
        strokeWidth={2}
        rx={2}
      />
      {width > 50 && height > 24 && (
        <text
          x={x + 4}
          y={y + 14}
          fill="#0f1419"
          fontSize={10}
          fontWeight={600}
        >
          {label}
        </text>
      )}
      <title>
        {`${fullPath}\nLOC: ${loc}\nDebt: ${debtScore?.toFixed?.(1) ?? "—"}`}
      </title>
    </g>
  );
}

export default function DebtHeatmap({ modules }) {
  const data = modules
    .filter((m) => (m.lines_of_code ?? 0) > 0)
    .map((m) => ({
      name: m.file_path.split("/").pop(),
      fullPath: m.file_path,
      size: Math.max(1, m.lines_of_code ?? 1),
      debtScore: m.debt_score ?? 0,
      loc: m.lines_of_code,
    }));

  if (!data.length) return null;

  return (
    <ResponsiveContainer width="100%" height={360}>
      <Treemap
        data={data}
        dataKey="size"
        aspectRatio={4 / 3}
        stroke="#0f1419"
        content={<TreemapNode />}
      >
        <Tooltip
          contentStyle={{
            background: "#1a2332",
            border: "1px solid #2a3548",
            borderRadius: 6,
            color: "#e7ecf3",
          }}
          formatter={(_, __, item) => {
            const p = item?.payload;
            if (!p) return null;
            return [
              `LOC ${p.loc} · Debt ${p.debtScore?.toFixed(1)}`,
              p.fullPath,
            ];
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}
