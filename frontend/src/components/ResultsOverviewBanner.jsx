import SectionHint from "./SectionHint";

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
      ? `${highRisk.length} module${highRisk.length === 1 ? "" : "s"} classified as high risk.`
      : "No modules are in the high-risk band for this analysis.";

  const focus = topFile
    ? ` Highest-priority file: ${topFile.file_path} (debt score ${Number(topFile.debt_score).toFixed(0)}).`
    : "";

  const effort =
    daysSaved > 0
      ? ` Addressing high-risk items first is estimated at ~${daysSaved.toFixed(0)} engineering days (directional).`
      : "";

  return (
    <div className="plain-english-banner card">
      <div className="plain-english-banner-head">
        <h2 className="plain-english-title">Executive summary</h2>
        <SectionHint label="Methodology">
          <p>
            Files are ranked by model-derived <strong>debt score</strong> (0–100). Risk bands follow
            the same thresholds as the module table. Effort estimates are directional, not commitments.
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
          <strong>Recommended review order:</strong>{" "}
          {hotspots.map((m) => m.file_path.split("/").pop()).join(" · ")}
        </p>
      )}
    </div>
  );
}
