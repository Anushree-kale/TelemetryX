import { useCallback, useEffect, useState } from "react";
import AnalyzeForm from "./AnalyzeForm";
import MetricsChart from "./MetricsChart";
import ModulesTable from "./ModulesTable";
import RoadmapTab from "./RoadmapTab";
import GraphTab from "./GraphTab";
import ClustersTab from "./ClustersTab";
import CoChangeTab from "./CoChangeTab";
import HistoryTrends from "./HistoryTrends";
import LanguageBreakdown from "./LanguageBreakdown";
import ShapJobSummary from "./ShapJobSummary";
import RecentProfilesPicker from "./RecentProfilesPicker";
import { SectionHint } from "./appPrimitives";
import WorkspaceTopbar from "./WorkspaceTopbar";
import ScanView from "./ScanView";
import WorkspaceOverview from "./WorkspaceOverview";
import BranchAnalyzer from "./BranchAnalyzer";
import { PANEL_TITLES } from "../labels";
import ExportButton from "./ExportButton";

export default function DashboardWorkspace({ apiBase, repoList, onReposChanged, onChromeVisibilityChange }) {
  const [activePanel, setActivePanel] = useState("overview");
  const [modules, setModules] = useState([]);
  const [status, setStatus] = useState(null);
  const [repoUrl, setRepoUrl] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [uiPhase, setUiPhase] = useState("idle");
  const [showProfiles, setShowProfiles] = useState(false);
  const [scanProgress, setScanProgress] = useState({ pct: 0, message: "" });

  useEffect(() => {
    onChromeVisibilityChange?.(true);
  }, [onChromeVisibilityChange]);

  const loadJobResults = useCallback(
    async (jobId) => {
      if (!jobId) return false;
      const res = await fetch(`${apiBase}/results/${jobId}`);
      if (!res.ok) return false;
      const data = await res.json();
      const list = data.modules || [];
      setModules(list);
      setRepoUrl(data.repo_url ?? null);
      setStatus(data.status ?? null);
      if (list.length > 0) {
        setUiPhase("results");
      }
      return true;
    },
    [apiBase],
  );

  const fetchLatestJob = useCallback(async () => {
    setModulesLoading(true);
    try {
      const res = await fetch(`${apiBase}/jobs/latest`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.job_id) return;
      setCurrentJobId(data.job_id);
      await loadJobResults(data.job_id);
    } catch {
      /* ignore */
    } finally {
      setModulesLoading(false);
    }
  }, [apiBase, loadJobResults]);

  useEffect(() => {
    fetchLatestJob();
  }, [fetchLatestJob]);

  const handleAnalysisComplete = (result) => {
    setModules(result.modules || []);
    setStatus(result.status);
    setRepoUrl(result.repo_url);
    setCurrentJobId(result.job_id ?? null);
    onReposChanged?.();
    setActivePanel("overview");
    setUiPhase("results");
    setShowProfiles(false);
    setScanProgress({ pct: 100, message: "" });
  };

  const handleAnalyzeStart = () => {
    setUiPhase("scanning");
    setScanProgress({ pct: 0, message: "Submitting analysis…" });
  };

  const handleNewScan = () => {
    setUiPhase("idle");
    setActivePanel("overview");
    setStatus(null);
    setScanProgress({ pct: 0, message: "" });
  };

  const isAnalyzing = status === "pending" || status === "running";
  const activeRepoUrl = repoUrl || modules[0]?.repo_url;
  const jobId = currentJobId ?? modules[0]?.job_id;
  const hasModules = modules.length > 0;
  const showResults = uiPhase === "results" && hasModules && !modulesLoading && !isAnalyzing;
  const showScan = uiPhase === "scanning" || (isAnalyzing && !showResults);
  const showIdle = !showResults && !showScan && !modulesLoading;

  const handleStatusChange = (s) => {
    setStatus(s);
    if (s === "failed") {
      setUiPhase("idle");
    }
  };

  return (
    <div className="tx-frame">
      <WorkspaceTopbar
        activePanel={activePanel}
        onSelect={setActivePanel}
        disabled={!hasModules}
        uiPhase={uiPhase}
        status={status}
      />

      <div className="tx-stage">
        {showIdle && (
          <div className="tx-view tx-view--idle">
            <p className="tx-eyebrow">// REPOSITORY DIAGNOSTICS</p>
            <h1 className="tx-hero-title">POINT THIS AT ANY PUBLIC REPO</h1>
            <p className="tx-hero-sub">
              Static analysis, causal commit history, and debt scoring — surfaced the
              moment the scan finishes, not scrolled to.
            </p>

            <AnalyzeForm
              apiBase={apiBase}
              knownRepos={repoList}
              onComplete={handleAnalysisComplete}
              onStatusChange={handleStatusChange}
              onAnalyzeStart={handleAnalyzeStart}
              onProgressChange={setScanProgress}
              variant="v2"
            />

            <div className="tx-idle-footer">
              <button
                type="button"
                className="tx-link-btn"
                onClick={() => setShowProfiles((v) => !v)}
                aria-expanded={showProfiles}
              >
                {showProfiles ? "Hide profile browser" : "Or browse who's shipping"}
              </button>
            </div>

            {showProfiles && (
              <div className="tx-profiles-wrap">
                <RecentProfilesPicker
                  repoList={repoList}
                  onRepoSelect={(name) => {
                    const url = /^https?:\/\//i.test(name)
                      ? name
                      : `https://github.com/${name}`;
                    const input = document.querySelector('.analyze-form--v2 input[name="repo_url"]');
                    if (input) {
                      const setter = Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype,
                        "value",
                      )?.set;
                      if (setter) setter.call(input, url);
                      else input.value = url;
                      input.dispatchEvent(new Event("input", { bubbles: true }));
                      input.focus();
                      const submitBtn = input.form?.querySelector('button[type="submit"]');
                      if (submitBtn) submitBtn.click();
                    }
                  }}
                />
              </div>
            )}
          </div>
        )}

        {showScan && (
          <ScanView
            progressPct={scanProgress.pct}
            progressMessage={scanProgress.message}
          />
        )}

        {showResults && activePanel === "overview" && (
          <WorkspaceOverview
            modules={modules}
            repoUrl={activeRepoUrl}
            jobId={jobId}
            apiBase={apiBase}
            onNavigate={setActivePanel}
            onNewScan={handleNewScan}
          />
        )}

        {showResults && activePanel !== "overview" && (
          <div className="tx-view tx-view--results show">
            <div className="tx-res-head">
              <div className="tx-res-repo">
                // {PANEL_TITLES[activePanel].toUpperCase()} &nbsp;·&nbsp;{" "}
                <b>{activeRepoUrl?.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "")}</b>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <ExportButton jobId={jobId} apiBase={apiBase} />
                <button type="button" className="tx-btn-ghost" onClick={handleNewScan}>
                  NEW SCAN
                </button>
              </div>
            </div>

            <div className="tx-panel-detail">
              {activePanel === "branch" && (
                <div className="card">
                  <BranchAnalyzer
                    apiBase={apiBase}
                    repoUrl={activeRepoUrl}
                  />
                </div>
              )}

              {activePanel === "fixes" && jobId && (
                <div className="card">
                  <div className="card-heading-row">
                    <h2>Remediation plan</h2>
                    <SectionHint label="Remediation">
                      <p>
                        Prioritized work items. Use <strong>Copy for Jira</strong> to export title
                        and acceptance criteria to your issue tracker.
                      </p>
                    </SectionHint>
                  </div>
                  <RoadmapTab jobId={jobId} apiBase={apiBase} />
                </div>
              )}

              {activePanel === "charts" && (
                <>
                  <HistoryTrends repoUrl={activeRepoUrl} apiBase={apiBase} />
                  <LanguageBreakdown modules={modules} />
                  {jobId && <ShapJobSummary modules={modules} />}
                  <div className="card">
                    <div className="card-heading-row">
                      <h2>Highest cyclomatic complexity</h2>
                      <SectionHint label="Complexity">
                        <p>
                          Branching complexity by file. Elevated values indicate higher testing and
                          review effort.
                        </p>
                      </SectionHint>
                    </div>
                    <MetricsChart modules={modules} />
                  </div>
                </>
              )}

              {activePanel === "files" && (
                <div className="card">
                  <div className="card-heading-row">
                    <h2>Module inventory</h2>
                    <SectionHint label="Table">
                      <p>
                        Select a row for drivers, git metrics, graph position, and co-change
                        partners.
                      </p>
                    </SectionHint>
                  </div>
                  <ModulesTable modules={modules} />
                </div>
              )}

              {activePanel === "graph" && jobId && (
                <div className="card">
                  <h2>Dependency graph</h2>
                  <p className="card-hint">Import relationships between modules.</p>
                  <GraphTab jobId={jobId} apiBase={apiBase} />
                </div>
              )}

              {activePanel === "clusters" && jobId && (
                <div className="card">
                  <h2>Module clusters</h2>
                  <p className="card-hint">Groups of related files in the dependency structure.</p>
                  <ClustersTab jobId={jobId} apiBase={apiBase} />
                </div>
              )}

              {activePanel === "cochange" && jobId && (
                <div className="card">
                  <h2>Co-change analysis</h2>
                  <p className="card-hint">Files frequently modified in the same commits.</p>
                  <CoChangeTab jobId={jobId} apiBase={apiBase} />
                </div>
              )}
            </div>
          </div>
        )}

        {modulesLoading && !showResults && !showScan && (
          <div className="tx-view tx-view--scan">
            <p className="tx-eyebrow">// LOADING</p>
            <p className="tx-scan-message">Checking for previous scans…</p>
          </div>
        )}
      </div>
    </div>
  );
}
