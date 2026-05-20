import { useCallback, useEffect, useRef, useState } from "react";
import AnalyzeForm from "./AnalyzeForm";
import DebtHeatmap from "./DebtHeatmap";
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
import ResultsOverviewBanner from "./ResultsOverviewBanner";
import SectionHint from "./SectionHint";
import SideNav from "./SideNav";
import OrangeCat from "./OrangeCat";
import FailureRiskTab from "./FailureRiskTab";
import { PANEL_TITLES } from "../labels";
import { SummaryCardsSkeleton, ModulesTableSkeleton } from "./Skeletons";

/** landing → scanning → results → sidebar-ready */
export default function DashboardWorkspace({ apiBase, repoList, onReposChanged }) {
  const [activePanel, setActivePanel] = useState("overview");
  const [modules, setModules] = useState([]);
  const [status, setStatus] = useState(null);
  const [repoUrl, setRepoUrl] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [modulesLoading, setModulesLoading] = useState(true);

  const [uiPhase, setUiPhase] = useState("landing");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [catPhase, setCatPhase] = useState("on-card");
  const walkTimerRef = useRef(null);

  const fetchAllModules = useCallback(async () => {
    setModulesLoading(true);
    try {
      const res = await fetch(`${apiBase}/modules`);
      if (!res.ok) return;
      const data = await res.json();
      const list = data.modules || [];
      setModules(list);
      if (list.length > 0) {
        setUiPhase("results");
        setSidebarExpanded(true);
        setCatPhase("on-sidebar");
      }
    } catch {
      /* ignore */
    } finally {
      setModulesLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchAllModules();
    return () => {
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    };
  }, [fetchAllModules]);

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
    onReposChanged?.();
    setActivePanel("overview");
    setUiPhase("results");
    if (result.modules?.length) {
      startCatWalk();
    }
  };

  const handleAnalyzeStart = () => {
    setUiPhase("scanning");
    setCatPhase("on-card");
    setSidebarExpanded(false);
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
        <section
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
              <h2>{PANEL_TITLES[activePanel]}</h2>
            </header>

            {activePanel === "overview" && (
              <>
                <ResultsOverviewBanner modules={modules} repoUrl={activeRepoUrl} />
                <SummaryCards modules={modules} repoUrl={activeRepoUrl} apiBase={apiBase} />
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

            {activePanel === "heatmap" && (
              <div className="card">
                <div className="card-heading-row">
                  <h2>Technical debt heatmap</h2>
                  <SectionHint label="Heatmap">
                    <p>
                      Rectangle size reflects lines of code. Color reflects debt score (lower is
                      healthier).
                    </p>
                  </SectionHint>
                </div>
                <p className="card-hint">Size = LOC · Color = debt score</p>
                <DebtHeatmap modules={modules} />
              </div>
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
