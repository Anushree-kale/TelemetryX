import { RISK_LABELS } from "../friendlyLabels";

export default function HomeHero({ modules }) {
  if (!modules?.length) return null;

  const withScore = modules.filter((m) => m.debt_score != null);
  const avgDebt =
    withScore.length > 0
      ? withScore.reduce((s, m) => s + m.debt_score, 0) / withScore.length
      : 0;
  const highRisk = modules.filter((m) => m.risk_level === "high").length;
  const topComplex = [...modules]
    .filter((m) => m.cyclomatic_complexity != null)
    .sort((a, b) => b.cyclomatic_complexity - a.cyclomatic_complexity)[0];
  const topChurn = [...modules]
    .filter((m) => m.churn_90d != null)
    .sort((a, b) => (b.churn_90d ?? 0) - (a.churn_90d ?? 0))[0];

  const vibeKey = avgDebt >= 60 ? "high" : avgDebt >= 35 ? "medium" : "low";
  const vibeLabel = RISK_LABELS[vibeKey] || "Scan complete";

  const boxes = [
    {
      emoji: "🧠",
      title: "Brain melt (avg)",
      value: avgDebt.toFixed(0),
      sub: "Mess score / 100 — higher = scarier to change",
      tone: vibeKey,
    },
    {
      emoji: "🚨",
      title: "High-alarm files",
      value: String(highRisk),
      sub: highRisk ? "Open Fix list panel for Jira tickets" : "Nothing screaming yet",
      tone: highRisk > 0 ? "high" : "low",
    },
    {
      emoji: "🌀",
      title: "Spiciest logic",
      value: topComplex ? topComplex.cyclomatic_complexity?.toFixed(1) : "—",
      sub: topComplex
        ? topComplex.file_path.split("/").pop()
        : "Complexity score on the messiest file",
      tone: "medium",
    },
    {
      emoji: "✏️",
      title: "Edit spam champ",
      value: topChurn ? String(topChurn.churn_90d) : "—",
      sub: topChurn
        ? `${topChurn.churn_90d} edits in 90d · ${topChurn.file_path.split("/").pop()}`
        : "Who's getting touched the most",
      tone: "medium",
    },
  ];

  return (
    <div className="home-hero-grid" aria-label="Quick repo snapshot">
      <div className="home-vibe-banner" data-tone={vibeKey}>
        <span className="home-vibe-emoji">{vibeKey === "high" ? "🔥" : vibeKey === "medium" ? "👀" : "✅"}</span>
        <div>
          <p className="home-vibe-title">Repo vibe</p>
          <p className="home-vibe-text">{vibeLabel}</p>
        </div>
      </div>
      {boxes.map((b) => (
        <div key={b.title} className="hero-stat-card" data-tone={b.tone}>
          <span className="hero-stat-emoji" aria-hidden>
            {b.emoji}
          </span>
          <p className="hero-stat-title">{b.title}</p>
          <p className="hero-stat-value">{b.value}</p>
          <p className="hero-stat-sub">{b.sub}</p>
        </div>
      ))}
    </div>
  );
}
