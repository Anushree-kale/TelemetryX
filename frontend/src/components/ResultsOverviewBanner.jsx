import SectionHint from "./SectionHint";

function topHotspots(modules, n = 3) {
  const scored = modules.filter((m) => m.debt_score != null);
  return [...scored].sort((a, b) => (b.debt_score ?? 0) - (a.debt_score ?? 0)).slice(0, n);
}

/** Plain-language headline for executives (derived from current module list). */
export default function ResultsOverviewBanner({ modules, repoUrl }) {
  if (!modules?.length) return null;

  const hotspots = topHotspots(modules, 3);
  const highRisk = modules.filter((m) => m.risk_level === "high");
  const daysSaved = highRisk.reduce((s, m) => s + (Number(m.roi_days) || 0), 0);
  const topFile = hotspots[0];

  const lead =
    highRisk.length > 0
      ? `This scan flagged ${highRisk.length} file${highRisk.length === 1 ? "" : "s"} as high risk.`
      : "No files are in the highest risk band in this scan.";

  const focus = topFile
    ? ` The single hottest file is ${topFile.file_path} (debt score ${Number(topFile.debt_score).toFixed(0)}).`
    : "";

  const effort =
    daysSaved > 0
      ? ` If you cleared the high-risk backlog first, the model estimates on the order of ${daysSaved.toFixed(0)} engineering days of payoff across those files (rough order-of-magnitude, not a guarantee).`
      : "";

  return (
    <div className="plain-english-banner card">
      <div className="plain-english-banner-head">
        <h2 className="plain-english-title">At a glance</h2>
        <SectionHint label="How we derive this banner">
          <p>
            We rank files by machine-learned <strong>debt score</strong> (0–100: higher means more
            structural risk and rework pressure). High risk uses the same model thresholds as the
            table. Estimated days sum the per-file ROI hints for high-risk items only—they are
            directional, not project plans.
          </p>
        </SectionHint>
      </div>
      {repoUrl && (
        <p className="plain-english-repo">
          <strong>Repository:</strong> {repoUrl}
        </p>
      )}
      <p className="plain-english-lead">
        {lead}
        {focus}
        {effort}
      </p>
      {hotspots.length > 0 && (
        <p className="plain-english-sub">
          <strong>Top {hotspots.length} costliest files to review first:</strong>{" "}
          {hotspots.map((m) => m.file_path).join(" · ")}
        </p>
      )}
    </div>
  );
}
