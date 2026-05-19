/** Plain-language labels — technical enough to trust, easy enough to skim */

export const APP_TAGLINE =
  "Your repo's vibe check — debt, bugs, churn, and what to fix first";

export const PANELS = [
  { id: "overview", icon: "🏠", label: "Home", hint: "Quick snapshot" },
  { id: "fixes", icon: "🎫", label: "Fix list", hint: "Jira-ready tickets" },
  { id: "charts", icon: "📊", label: "Charts", hint: "Trends & complexity" },
  { id: "heatmap", icon: "🗺️", label: "Heatmap", hint: "Where pain lives" },
  { id: "files", icon: "📁", label: "All files", hint: "Full breakdown" },
  { id: "graph", icon: "🕸️", label: "Web map", hint: "How files connect" },
  { id: "clusters", icon: "👥", label: "Squads", hint: "File groups" },
  { id: "cochange", icon: "🔗", label: "Buddy files", hint: "Change together" },
];

export const COLUMN_LABELS = {
  file_path: "File + TL;DR",
  debt_score: "Mess score",
  risk_level: "Vibe",
  priority_score: "Fix order",
  unique_author_count: "Who touched it",
  top_author_pct: "One-person show %",
  bug_fix_ratio: "Bug-fix energy",
  days_since_last_commit: "Days asleep",
  downstream_count: "Ripple zone",
  out_degree: "Imports",
  betweenness: "Bridge file?",
  churn_90d: "Edit spam (90d)",
  lines_of_code: "Size (LOC)",
  test_coverage_ratio: "Test backup %",
  roi_days: "Payoff (days)",
  cyclomatic_complexity: "Brain melt score",
};

export const GLOSSARY = {
  file_path: "Path in the repo plus a short plain-English read on the file.",
  debt_score:
    "0–100: how messy/risky this file feels to change. Higher = more 'please don't touch without a plan'.",
  risk_level: "Low / medium / high — how loud the alarm is on this file.",
  priority_score: "What to fix first when you only have one sprint.",
  unique_author_count: "How many devs recently edited this file (bus-factor signal).",
  top_author_pct: "How much one person owns the commits (high = risky if they leave).",
  bug_fix_ratio:
    "Share of commits that look like bug fixes vs features — high can mean instability.",
  days_since_last_commit: "How long since anyone touched this file.",
  downstream_count: "How many other files depend on this one — break it, break them.",
  out_degree: "How many files this one pulls in.",
  betweenness: "Is this file a bottleneck in the dependency graph?",
  churn_90d: "How often this file got edited in the last 90 days (activity, not quality).",
  lines_of_code: "Non-blank lines in the file.",
  roi_days: "Rough days of payoff if you clean up debt here (estimate, not a promise).",
  cyclomatic_complexity:
    "How many paths/branches — high = harder to test and reason about.",
  test_coverage_ratio:
    "Test lines vs source lines on disk (heuristic — not JaCoCo/pytest coverage).",
};

export const SHAP_PLAIN = {
  "Test file ratio": "do you have test files backing this code?",
  "Test coverage ratio": "do you have test files backing this code?",
  "Cyclomatic complexity": "how branchy / twisty the logic is",
  "Cognitive complexity": "how hard it is for humans to read",
  "Churn rate (90d)": "how often people keep editing it",
  "Lines of code": "how big the file is",
  "Function count": "how many functions live here",
  "Max function complexity": "the gnarliest single function",
  "Dependency fan-out": "how many other files it imports",
};

export const RISK_LABELS = {
  high: "Needs love ASAP",
  medium: "Keep an eye on it",
  low: "Chill for now",
};

export function buildHealthSummary(modules, repoUrl) {
  if (!modules?.length) return null;

  const highRisk = modules.filter((m) => m.risk_level === "high");
  const withScore = modules.filter((m) => m.debt_score != null);
  const avgDebt =
    withScore.length > 0
      ? withScore.reduce((s, m) => s + m.debt_score, 0) / withScore.length
      : 0;
  const top = [...withScore].sort((a, b) => (b.debt_score ?? 0) - (a.debt_score ?? 0))[0];
  const highChurn = [...modules]
    .filter((m) => m.churn_90d != null)
    .sort((a, b) => (b.churn_90d ?? 0) - (a.churn_90d ?? 0))[0];
  const bugHeavy = [...modules]
    .filter((m) => m.bug_fix_ratio != null)
    .sort((a, b) => (b.bug_fix_ratio ?? 0) - (a.bug_fix_ratio ?? 0))[0];
  const daysSaved = highRisk.reduce((s, m) => s + (Number(m.roi_days) || 0), 0);

  const vibe =
    avgDebt >= 60
      ? "Spicy — lots of rework risk"
      : avgDebt >= 35
        ? "Mid — some files need attention"
        : "Mostly calm — still peek at hotspots";

  const lines = [
    "══════════════════════════════",
    "   TELEMETRYX · REPO RECEIPT",
    "══════════════════════════════",
    repoUrl ? `Repo: ${repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//i, "")}` : "",
    `Date: ${new Date().toLocaleString()}`,
    "──────────────────────────────",
    `Overall vibe: ${vibe}`,
    `Avg mess score: ${avgDebt.toFixed(0)}/100`,
    `Files scanned: ${modules.length}`,
    `High-alarm files: ${highRisk.length}`,
    daysSaved > 0 ? `~${daysSaved.toFixed(0)} dev-days if you fix high-risk first` : "",
    "──────────────────────────────",
    top ? `Hottest file: ${top.file_path.split("/").pop()} (${top.debt_score?.toFixed(0)}/100)` : "",
    highChurn
      ? `Most edited (90d): ${highChurn.file_path.split("/").pop()} (${highChurn.churn_90d} edits)`
      : "",
    bugHeavy && Number(bugHeavy.bug_fix_ratio) > 0.3
      ? `Bug-fix heavy: ${bugHeavy.file_path.split("/").pop()}`
      : "",
    "──────────────────────────────",
    highRisk.length > 0
      ? "TL;DR: Start with the Fix list panel → copy tickets to Jira."
      : "TL;DR: No red-alert files — keep tests + churn in check.",
    "══════════════════════════════",
    "        thanks for scanning ✨",
    "══════════════════════════════",
  ].filter(Boolean);

  return lines.join("\n");
}
