import SectionHint from "./SectionHint";
import { RISK_LABELS } from "../friendlyLabels";

function topHotspots(modules, n = 3) {
  const scored = modules.filter((m) => m.debt_score != null);
  return [...scored].sort((a, b) => (b.debt_score ?? 0) - (a.debt_score ?? 0)).slice(0, n);
}

export default function ResultsOverviewBanner({ modules, repoUrl }) {
  if (!modules?.length) return null;

  const hotspots = topHotspots(modules, 3);
  const highRisk = modules.filter((m) => m.risk_level === "high");
  const daysSaved = highRisk.reduce((s, m) => s + (Number(m.roi_days) || 0), 0);
  const topFile = hotspots[0];

  const lead =
    highRisk.length > 0
      ? `${highRisk.length} file${highRisk.length === 1 ? "" : "s"} are giving main-character energy (high alarm).`
      : "No files are screaming for help in this scan — nice.";

  const focus = topFile
    ? ` The spiciest one: ${topFile.file_path} (mess score ${Number(topFile.debt_score).toFixed(0)}/100).`
    : "";

  const effort =
    daysSaved > 0
      ? ` Knock out the red files first and you're looking at ~${daysSaved.toFixed(0)} dev-days of payoff (ballpark, not a contract).`
      : "";

  const vibe = topFile?.risk_level ? RISK_LABELS[topFile.risk_level] : null;

  return (
    <div className="plain-english-banner card">
      <div className="plain-english-banner-head">
        <h2 className="plain-english-title">The tea ☕</h2>
        <SectionHint label="How we get this">
          <p>
            We rank files by <strong>mess score</strong> (0–100). High-alarm uses the same rules as
            the table. Day estimates are hints only.
          </p>
        </SectionHint>
      </div>
      {repoUrl && (
        <p className="plain-english-repo">
          <strong>Repo:</strong> {repoUrl}
        </p>
      )}
      <p className="plain-english-lead">
        {lead}
        {focus}
        {effort}
      </p>
      {vibe && topFile && (
        <p className="plain-english-sub">
          <strong>Top file vibe:</strong> {vibe}
        </p>
      )}
      {hotspots.length > 0 && (
        <p className="plain-english-sub">
          <strong>Peek these first:</strong>{" "}
          {hotspots.map((m) => m.file_path.split("/").pop()).join(" · ")}
        </p>
      )}
    </div>
  );
}
