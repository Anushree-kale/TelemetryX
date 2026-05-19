import { useCallback, useEffect, useState } from "react";
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
import { SummaryCardsSkeleton, ModulesTableSkeleton } from "./Skeletons";

const INTEL_TABS = [
  { id: "roadmap", short: "Roadmap", label: "Fix roadmap (what to do first)" },
  { id: "graph", short: "Graph", label: "Dependency map (how files connect)" },
  { id: "clusters", short: "Clusters", label: "Module groups (files that belong together)" },
  { id: "cochange", short: "Co-change", label: "Change coupling (files that break together)" },
];

export default function DashboardWorkspace({ apiBase, repoList, onReposChanged }) {
  const [intelTab, setIntelTab] = useState("roadmap");
  const [modules, setModules] = useState([]);
  const [status, setStatus] = useState(null);
  const [repoUrl, setRepoUrl] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [modulesLoading, setModulesLoading] = useState(true);

  const fetchAllModules = useCallback(async () => {
    setModulesLoading(true);
    try {
      const res = await fetch(`${apiBase}/modules`);
      if (!res.ok) return;
      const data = await res.json();
      setModules(data.modules || []);
    } catch {
      /* ignore on initial load */
    } finally {
      setModulesLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchAllModules();
  }, [fetchAllModules]);

  const handleAnalysisComplete = (result) => {
    setModules(result.modules || []);
    setStatus(result.status);
    setRepoUrl(result.repo_url);
    setCurrentJobId(result.job_id ?? null);
    onReposChanged?.();
  };

  const isAnalyzing = status === "pending" || status === "running";
  const activeRepoUrl = repoUrl || modules[0]?.repo_url;
  const jobId = currentJobId ?? modules[0]?.job_id;
  const showResultsSkeleton = modulesLoading || isAnalyzing;
  const hasModules = modules.length > 0;

  return (
    <>
      <div className="card">
        <AnalyzeForm
          apiBase={apiBase}
          knownRepos={repoList}
          onComplete={handleAnalysisComplete}
          onStatusChange={setStatus}
        />
        {status && status !== "running" && (
          <p className={`status ${status}`}>
            {status === "complete" && activeRepoUrl && `Analysis complete: ${activeRepoUrl}`}
            {status === "failed" && "Analysis failed. Check the repo URL and try again."}
            {status === "pending" && "Job queued…"}
          </p>
        )}
      </div>

      {showResultsSkeleton && (
        <>
          <SummaryCardsSkeleton />
          <ModulesTableSkeleton />
        </>
      )}

      {!showResultsSkeleton && !hasModules && (
        <div className="empty-state card">
          <div className="empty-state-icon">🔍</div>
          <h2>Analyze your first repo</h2>
          <p>
            Enter a GitHub repository URL above to compute technical debt scores, see complexity
            signals, and get plain-English explanations of what is driving each file&apos;s risk.
          </p>
        </div>
      )}

      {!showResultsSkeleton && hasModules && (
        <>
          <ResultsOverviewBanner modules={modules} repoUrl={activeRepoUrl} />

          <SummaryCards modules={modules} repoUrl={activeRepoUrl} apiBase={apiBase} />

          <HistoryTrends repoUrl={activeRepoUrl} apiBase={apiBase} />
          <LanguageBreakdown modules={modules} />

          {jobId && <ShapJobSummary jobId={jobId} apiBase={apiBase} />}

          <div className="card">
            <div className="card-heading-row">
              <h2>Debt heatmap</h2>
              <SectionHint label="How to read the heatmap">
                <p>
                  Each rectangle is one file. <strong>Size</strong> reflects lines of code.{" "}
                  <strong>Color</strong> reflects debt score (greener is healthier, redder needs
                  attention sooner).
                </p>
              </SectionHint>
            </div>
            <p className="card-hint">Block size = LOC · Color = debt score (green → amber → red)</p>
            <DebtHeatmap modules={modules} />
          </div>

          {jobId && (
            <div className="card intelligence-panel">
              <div className="intelligence-panel-header">
                <span className="intelligence-panel-emoji" aria-hidden>
                  🔍
                </span>
                <div>
                  <h2 className="intelligence-panel-title">Deep analysis</h2>
                  <p className="intelligence-panel-sub">
                    Explore priorities, structure, ownership clusters, and files that change in
                    lockstep.
                  </p>
                </div>
              </div>
              <div className="intel-tabs" role="tablist" aria-label="Deep analysis views">
                {INTEL_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={intelTab === t.id}
                    className={`intel-tab ${intelTab === t.id ? "active" : ""}`}
                    title={t.label}
                    onClick={() => setIntelTab(t.id)}
                  >
                    <span className="intel-tab-short">{t.short}</span>
                    <span className="intel-tab-long">{t.label}</span>
                  </button>
                ))}
              </div>
              {intelTab === "roadmap" && <RoadmapTab jobId={jobId} apiBase={apiBase} />}
              {intelTab === "graph" && <GraphTab jobId={jobId} apiBase={apiBase} />}
              {intelTab === "clusters" && <ClustersTab jobId={jobId} apiBase={apiBase} />}
              {intelTab === "cochange" && <CoChangeTab jobId={jobId} apiBase={apiBase} />}
            </div>
          )}

          <div className="card">
            <div className="card-heading-row">
              <h2>Top 10 — cyclomatic complexity</h2>
              <SectionHint label="Cyclomatic complexity">
                <p>
                  A count of independent paths through the code—roughly, how hard a function is to
                  test and reason about. Higher numbers usually mean more maintenance risk.
                </p>
              </SectionHint>
            </div>
            <MetricsChart modules={modules} />
          </div>

          <div className="card">
            <div className="card-heading-row">
              <h2>Module metrics</h2>
              <SectionHint label="This table">
                <p>
                  Click any row for a full breakdown (SHAP drivers, git history, graph metrics, and
                  co-change partners). Use the glossary below the headers if a column name is
                  unfamiliar.
                </p>
              </SectionHint>
            </div>
            <ModulesTable modules={modules} />
          </div>
        </>
      )}
    </>
  );
}
