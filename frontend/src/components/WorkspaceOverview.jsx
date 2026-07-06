import { useEffect, useMemo, useState } from "react";

function shortRepo(url) {
  if (!url) return "";
  return url.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "");
}

function topModules(modules, limit = 6) {
  return [...modules]
    .filter((m) => m.debt_score != null)
    .sort((a, b) => (b.debt_score ?? 0) - (a.debt_score ?? 0))
    .slice(0, limit);
}

function languageCount(modules) {
  return new Set(modules.map((m) => m.language).filter(Boolean)).size;
}

export default function WorkspaceOverview({
  modules,
  repoUrl,
  jobId,
  apiBase,
  onNavigate,
  onNewScan,
  privacyMode,
}) {
  const [history, setHistory] = useState([]);
  const [failureRisk, setFailureRisk] = useState(null);

  useEffect(() => {
    if (!repoUrl) return;
    fetch(`${apiBase}/jobs/history?repo_url=${encodeURIComponent(repoUrl)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch(() => {});
  }, [repoUrl, apiBase]);

  useEffect(() => {
    if (!jobId) return;
    fetch(`${apiBase}/jobs/${jobId}/failure-risk`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.predictions?.length) return;
        const avg =
          data.predictions.reduce((s, p) => s + (p.risk_score ?? 0), 0) /
          data.predictions.length;
        setFailureRisk(avg);
      })
      .catch(() => {});
  }, [jobId, apiBase]);

  const withScore = modules.filter((m) => m.debt_score != null);
  const avgDebt =
    withScore.length > 0
      ? Math.round(withScore.reduce((s, m) => s + Number(m.debt_score), 0) / withScore.length)
      : 0;

  const highRiskCount = modules.filter((m) => m.risk_level === "high").length;
  const langs = languageCount(modules);

  const historyIndex = jobId ? history.findIndex((h) => h.id === jobId) : -1;
  const previousJob =
    historyIndex > 0
      ? history[historyIndex - 1]
      : history.length > 1
        ? history[history.length - 2]
        : null;

  const debtDelta = previousJob?.avg_debt_score != null
    ? avgDebt - Math.round(previousJob.avg_debt_score)
    : null;

  const prevHighRisk = previousJob?.high_risk_count ?? null;
  const highRiskDelta =
    prevHighRisk != null ? highRiskCount - prevHighRisk : null;

  const remediationCount = modules.filter(
    (m) => m.risk_level === "high" || (m.priority_score != null && m.priority_score >= 0.7),
  ).length;

  const riskPct = failureRisk != null
    ? Math.round(failureRisk * 100)
    : history.length > 0
      ? Math.round((history[history.length - 1]?.avg_failure_risk ?? 0) * 100)
      : null;

  const signalHeights = useMemo(
    () => Array.from({ length: 16 }, () => 20 + Math.random() * 80),
    [jobId],
  );

  const ranked = topModules(modules);

  return (
    <div className="tx-view tx-view--results show">
      <div className="tx-res-head">
        <div className="tx-res-repo">
          // SCAN COMPLETE &nbsp;·&nbsp; <b>{shortRepo(repoUrl)}</b> &nbsp;·&nbsp;{" "}
          {modules.length} module{modules.length === 1 ? "" : "s"}
          {privacyMode && (
            <span className="tx-privacy-tag"> · DP on</span>
          )}
        </div>
        <button type="button" className="tx-btn-ghost" onClick={onNewScan}>
          NEW SCAN
        </button>
      </div>

      <div className="tx-kpi-row">
        <button type="button" className="tx-kpi" onClick={() => onNavigate?.("files")}>
          <div className="tx-kpi-label">Debt score</div>
          <div className="tx-kpi-bar"><i style={{ width: `${avgDebt}%` }} /></div>
          <div className="tx-kpi-val">{avgDebt || "—"}</div>
          <div className="tx-kpi-delta">
            {debtDelta != null && debtDelta !== 0
              ? `${debtDelta > 0 ? "↑" : "↓"} ${Math.abs(debtDelta)} vs last scan`
              : "avg across modules"}
          </div>
        </button>

        <button type="button" className="tx-kpi" onClick={() => onNavigate?.("failure")}>
          <div className="tx-kpi-label">High-risk modules</div>
          <div className="tx-kpi-bar">
            <i style={{ width: `${Math.min(100, highRiskCount * 8)}%` }} />
          </div>
          <div className="tx-kpi-val">{highRiskCount}</div>
          <div className="tx-kpi-delta">
            {highRiskDelta != null && highRiskDelta !== 0
              ? (highRiskDelta > 0 ? `${highRiskDelta} newly flagged` : `${Math.abs(highRiskDelta)} cleared`)
              : "risk band: high"}
          </div>
        </button>

        <div className="tx-kpi">
          <div className="tx-kpi-label">Coverage scanned</div>
          <div className="tx-kpi-bar"><i style={{ width: "100%" }} /></div>
          <div className="tx-kpi-val">
            100<span className="tx-kpi-pct">%</span>
          </div>
          <div className="tx-kpi-delta">
            {modules.length} files · {langs || "—"} language{langs === 1 ? "" : "s"}
          </div>
        </div>

        <button type="button" className="tx-kpi" onClick={() => onNavigate?.("fixes")}>
          <div className="tx-kpi-label">Remediation items</div>
          <div className="tx-kpi-bar">
            <i style={{ width: `${Math.min(100, remediationCount * 12)}%` }} />
          </div>
          <div className="tx-kpi-val">{remediationCount}</div>
          <div className="tx-kpi-delta">Jira-ready</div>
        </button>
      </div>

      <div className="tx-main-grid">
        <div className="tx-panel">
          <h3 className="tx-panel-title">
            Top risk modules <span>ranked by XGBoost debt score</span>
          </h3>
          <div className="tx-mod-list">
            {ranked.length === 0 ? (
              <p className="tx-mod-empty">No debt scores in this scan.</p>
            ) : (
              ranked.map((m) => (
                <div key={m.file_path} className="tx-mod-row">
                  <div className="tx-mod-path" title={m.file_path}>{m.file_path}</div>
                  <div className="tx-mod-bar-wrap">
                    <div
                      className="tx-mod-bar"
                      style={{ width: `${Math.min(100, m.debt_score)}%` }}
                    />
                  </div>
                  <div className="tx-mod-score">{Math.round(m.debt_score)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          type="button"
          className="tx-panel tx-panel--clickable"
          onClick={() => onNavigate?.("failure")}
        >
          <h3 className="tx-panel-title">
            Failure risk <span>LSTM</span>
          </h3>
          <div className="tx-gauge-wrap">
            <div className="tx-gauge-num">
              {riskPct != null ? `${riskPct}%` : "—"}
            </div>
            <div className="tx-gauge-cap">30-day regression likelihood</div>
            <div className="tx-signal-strip" aria-hidden>
              {signalHeights.map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
