import { useCallback, useEffect, useRef, useState } from "react";
import AnalyzeForm from "./AnalyzeForm";
import MetricsChart from "./MetricsChart";
import ModulesTable from "./ModulesTable";
import SummaryCards from "./SummaryCards";
import RoadmapTab from "./RoadmapTab";
import GraphTab from "./GraphTab";
import ClustersTab from "./ClustersTab";
import CoChangeTab from "./CoChangeTab";
import HistoryTrends from "./HistoryTrends";
import LanguageBreakdown from "./LanguageBreakdown";
import ShapJobSummary from "./ShapJobSummary";
import OverviewScorecard from "./OverviewScorecard";
import DebtHeatmap from "./DebtHeatmap";
import ResultsOverviewBanner from "./ResultsOverviewBanner";
import TeamHealthTab from "./TeamHealthTab";
import PrivacyTab from "./PrivacyTab";
import SectionHint from "./SectionHint";
import SideNav from "./SideNav";
import OrangeCat from "./OrangeCat";
import RepoScrollPicker from "./RepoScrollPicker";
import FailureRiskTab from "./FailureRiskTab";
import { PANEL_TITLES } from "../labels";
import ExportButton from "./ExportButton";
import { SummaryCardsSkeleton, ModulesTableSkeleton } from "./Skeletons";

/** landing → scanning → results → sidebar-ready */
export default function DashboardWorkspace({ apiBase, repoList, onReposChanged }) {
  const [activePanel, setActivePanel] = useState("overview");
  const [modules, setModules] = useState([]);
  const [status, setStatus] = useState(null);
  const [repoUrl, setRepoUrl] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);

  const [uiPhase, setUiPhase] = useState("landing");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [catPhase, setCatPhase] = useState("on-card");
  const walkTimerRef = useRef(null);
  const scanSectionRef = useRef(null);

  const handleRepoSelect = useCallback((repoName) => {
    const url = /^https?:\/\//i.test(repoName)
      ? repoName
      : `https://github.com/${repoName}`;

    scanSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

    window.setTimeout(() => {
      const input = scanSectionRef.current?.querySelector('input[name="repo_url"]');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, url);
      else input.value = url;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }, 450);
  }, []);

  const loadJobResults = useCallback(
    async (jobId) => {
      if (!jobId) return false;
      const res = await fetch(`${apiBase}/results/${jobId}`);
      if (!res.ok) return false;
      const data = await res.json();
      const list = data.modules || [];
      setModules(list);
      setRepoUrl(data.repo_url ?? null);
      setPrivacyMode(!!data.privacy_mode);
      setStatus(data.status ?? null);
      if (list.length > 0) {
        setUiPhase("results");
        setSidebarExpanded(true);
        setCatPhase("on-sidebar");
      }
      return true;
    },
    [apiBase],
  );

  const fetchLatestJob = useCallback(async () => {
    setModulesLoading(true);
    try {
      const res = await fetch(`${apiBase}/modules`);
      if (!res.ok) return;
      const list = (await res.json()).modules || [];
      if (!list.length) return;
      const latestJobId = Math.max(...list.map((m) => m.job_id).filter(Boolean));
      setCurrentJobId(latestJobId);
      await loadJobResults(latestJobId);
    } catch {
      /* ignore */
    } finally {
      setModulesLoading(false);
    }
  }, [apiBase, loadJobResults]);

  useEffect(() => {
    fetchLatestJob();
    return () => {
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    };
  }, [fetchLatestJob]);

  const startCatWalk = useCallback(() => {
    setCatPhase("walking");
    walkTimerRef.current = setTimeout(() => {
      setSidebarExpanded(true);
      setCatPhase("on-sidebar");
    }, 1600);
  }, []);

  const handleAnalysisComplete = (result) => {
    setModules(result.modules || []);
    setStatus(result.status);
    setRepoUrl(result.repo_url);
    setCurrentJobId(result.job_id ?? null);
    setPrivacyMode(!!result.privacy_mode);
    onReposChanged?.();
    setActivePanel("overview");
    setUiPhase("results");
    if (result.modules?.length) {
      startCatWalk();
    }
  };

  const handleAnalyzeStart = (enabledPrivacy = false) => {
    setUiPhase("scanning");
    setCatPhase("on-card");
    setSidebarExpanded(false);
    setPrivacyMode(!!enabledPrivacy);
  };

  const isAnalyzing = status === "pending" || status === "running";
  const activeRepoUrl = repoUrl || modules[0]?.repo_url;
  const jobId = currentJobId ?? modules[0]?.job_id;
  const showResultsSkeleton = modulesLoading || isAnalyzing;
  const hasModules = modules.length > 0;
  const showResults = uiPhase === "results" && hasModules && !showResultsSkeleton;
  const scanCompact = uiPhase === "scanning" || uiPhase === "results";

  const handleStatusChange = (s) => {
    setStatus(s);
    if (s === "failed") {
      setUiPhase("landing");
      setCatPhase("on-card");
      setSidebarExpanded(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <SideNav
        activePanel={activePanel}
        onSelect={setActivePanel}
        expanded={sidebarExpanded}
        disabled={!hasModules}
        showCat={catPhase === "on-sidebar"}
      />

      <div className="dashboard-stage">
        {uiPhase === "landing" && (
          <RepoScrollPicker onRepoSelect={handleRepoSelect} />
        )}

        <section
          ref={scanSectionRef}
          className={`scan-stage ${scanCompact ? "scan-stage--compact" : "scan-stage--centered"}`}
        >
          <div className="scan-card">
            {catPhase === "on-card" && (
              <div className="scan-card-cat">
                <OrangeCat variant="sitting" />
              </div>
            )}

            <AnalyzeForm
              apiBase={apiBase}
              knownRepos={repoList}
              onComplete={handleAnalysisComplete}
              onStatusChange={handleStatusChange}
              onAnalyzeStart={handleAnalyzeStart}
              compact={scanCompact}
            />
          </div>
        </section>

        {catPhase === "walking" && (
          <div className="cat-walker" aria-hidden>
            <OrangeCat variant="walking" />
          </div>
        )}

        {showResultsSkeleton && uiPhase !== "landing" && (
          <div className="results-loading">
            <SummaryCardsSkeleton />
            <ModulesTableSkeleton />
          </div>
        )}

        {showResults && (
          <div className="results-panel">
            <header className="panel-header">
              <div className="panel-header-title">
                <h2>{PANEL_TITLES[activePanel]}</h2>
                {privacyMode && (
                  <span className="privacy-badge" title="Differential privacy (DP engine) is enabled for this analysis">
                    <span className="privacy-badge-icon" aria-hidden>🛡️</span>
                    Privacy active
                  </span>
                )}
              </div>
              <ExportButton jobId={jobId} apiBase={apiBase} />
            </header>

            {activePanel === "overview" && (
              <>
                <ResultsOverviewBanner modules={modules} repoUrl={activeRepoUrl} />
                <OverviewScorecard
                  modules={modules}
                  repoUrl={activeRepoUrl}
                  jobId={jobId}
                  apiBase={apiBase}
                  onNavigate={setActivePanel}
                />
                <SummaryCards modules={modules} repoUrl={activeRepoUrl} apiBase={apiBase} />
                <div className="card">
                  <div className="card-heading-row">
                    <h2>Debt heatmap</h2>
                    <SectionHint label="Heatmap">
                      <p>
                        File-level debt scores from the XGBoost debt model. Darker cells indicate
                        higher predicted rework risk.
                      </p>
                    </SectionHint>
                  </div>
                  <DebtHeatmap modules={modules} />
                </div>
              </>
            )}

            {activePanel === "fixes" && jobId && (
              <div className="card">
                <div className="card-heading-row">
                  <h2>Remediation plan</h2>
                  <SectionHint label="Remediation">
                    <p>
                      Prioritized work items. Use <strong>Copy for Jira</strong> to export title and
                      acceptance criteria to your issue tracker.
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
                {jobId && <ShapJobSummary jobId={jobId} apiBase={apiBase} />}
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

            {activePanel === "failure" && jobId && (
              <div className="card">
                <div className="card-heading-row">
                  <h2>Failure risk prediction</h2>
                  <SectionHint label="Failure risk">
                    <p>
                      LSTM risk scores. Predicts likelihood of future bugs and failures based on churn, complexity, and commit cadence.
                    </p>
                  </SectionHint>
                </div>
                <FailureRiskTab jobId={jobId} apiBase={apiBase} />
              </div>
            )}

            {activePanel === "teamhealth" && jobId && (
              <div className="card">
                <div className="card-heading-row">
                  <h2>Team health</h2>
                  <SectionHint label="Team health">
                    <p>
                      Burnout Radar (XGBoost) on git-derived cohort metrics. Default weights are synthetic-trained; optional labeled validation CSV improves credibility.
                    </p>
                  </SectionHint>
                </div>
                <TeamHealthTab jobId={jobId} apiBase={apiBase} />
              </div>
            )}

            {activePanel === "privacy" && jobId && (
              <div className="card">
                <div className="card-heading-row">
                  <h2>Privacy &amp; Synthesis Compliance</h2>
                  <SectionHint label="Privacy &amp; Synthesis">
                    <p>
                      Calibrated differential privacy metrics, contributor PII stripping, and tabular GMM / time-series LSTM synthesis validation. Image VAE synthesis is not part of this release.
                    </p>
                  </SectionHint>
                </div>
                <PrivacyTab jobId={jobId} apiBase={apiBase} />
              </div>
            )}

            {activePanel === "files" && (
              <div className="card">
                <div className="card-heading-row">
                  <h2>Module inventory</h2>
                  <SectionHint label="Table">
                    <p>
                      Select a row for drivers, git metrics, graph position, and co-change
                      partners. Column headers include definitions.
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
        )}
      </div>
    </div>
  );
}
