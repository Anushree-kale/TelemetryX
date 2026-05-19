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
import SideNav from "./SideNav";
import HomeHero from "./HomeHero";
import HealthReceipt from "./HealthReceipt";
import { SummaryCardsSkeleton, ModulesTableSkeleton } from "./Skeletons";

const PANEL_TITLES = {
  overview: "Home — quick snapshot",
  fixes: "Fix list — Jira-ready tickets",
  charts: "Charts — trends & brain-melt scores",
  heatmap: "Heatmap — where the pain lives",
  files: "All files — full breakdown",
  graph: "Web map — how files connect",
  clusters: "Squads — files that hang together",
  cochange: "Buddy files — change in sync",
};

export default function DashboardWorkspace({ apiBase, repoList, onReposChanged }) {
  const [activePanel, setActivePanel] = useState("overview");
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
    setActivePanel("overview");
  };

  const isAnalyzing = status === "pending" || status === "running";
  const activeRepoUrl = repoUrl || modules[0]?.repo_url;
  const jobId = currentJobId ?? modules[0]?.job_id;
  const showResultsSkeleton = modulesLoading || isAnalyzing;
  const hasModules = modules.length > 0;

  return (
    <div className="dashboard-layout">
      <SideNav
        activePanel={activePanel}
        onSelect={setActivePanel}
        hasData={hasModules}
        disabled={!hasModules}
      />

      <div className="dashboard-main">
        <section className="card home-scan-card">
          <AnalyzeForm
            apiBase={apiBase}
            knownRepos={repoList}
            onComplete={handleAnalysisComplete}
            onStatusChange={setStatus}
          />
          {status && status !== "running" && (
            <p className={`status ${status}`}>
              {status === "complete" && activeRepoUrl && `Done — ${activeRepoUrl}`}
              {status === "failed" && "Scan failed. Double-check the GitHub link and try again."}
              {status === "pending" && "Queued… hang tight"}
            </p>
          )}

          {hasModules && !showResultsSkeleton && (
            <>
              <HomeHero modules={modules} />
              <p className="panel-hint">
                <strong>Want the tea?</strong> Use the left panels for charts, Jira-style fix tickets,
                heatmaps, and file-by-file details.
              </p>
            </>
          )}
        </section>

        {showResultsSkeleton && (
          <>
            <SummaryCardsSkeleton />
            <ModulesTableSkeleton />
          </>
        )}

        {!showResultsSkeleton && !hasModules && (
          <div className="empty-state card">
            <div className="empty-state-icon">🔗</div>
            <h2>Drop a GitHub link to start</h2>
            <p>
              We&apos;ll scan your repo for messy files, bug-fix energy, edit spam (churn), and
              what to fix first — no PhD required.
            </p>
          </div>
        )}

        {!showResultsSkeleton && hasModules && (
          <>
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
                  <h2>What to fix first</h2>
                  <SectionHint label="Fix list">
                    <p>
                      Ranked cleanup cards. Hit <strong>Copy as Jira ticket</strong> to paste into
                      your board — titles and acceptance criteria included.
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
                    <h2>Top 10 — brain-melt scores</h2>
                    <SectionHint label="Brain melt score">
                      <p>
                        How branchy/twisty the logic is. High = harder to test, review, and ship
                        without surprises.
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
                  <h2>Pain heatmap</h2>
                  <SectionHint label="Reading the heatmap">
                    <p>
                      Each block is a file. <strong>Bigger</strong> = more lines.{" "}
                      <strong>Color</strong> = mess score (green chill → red fix-me).
                    </p>
                  </SectionHint>
                </div>
                <p className="card-hint">Size = LOC · Color = mess score</p>
                <DebtHeatmap modules={modules} />
              </div>
            )}

            {activePanel === "files" && (
              <div className="card">
                <div className="card-heading-row">
                  <h2>Every file, explained</h2>
                  <SectionHint label="This table">
                    <p>
                      Click a row for the full story — what drives the score, git vibes, and buddy
                      files. Hover column headers for quick defs.
                    </p>
                  </SectionHint>
                </div>
                <ModulesTable modules={modules} />
              </div>
            )}

            {activePanel === "graph" && jobId && (
              <div className="card">
                <h2>Dependency web map</h2>
                <p className="card-hint">How files import each other — spot bottlenecks fast.</p>
                <GraphTab jobId={jobId} apiBase={apiBase} />
              </div>
            )}

            {activePanel === "clusters" && jobId && (
              <div className="card">
                <h2>File squads</h2>
                <p className="card-hint">Groups of files that naturally belong together.</p>
                <ClustersTab jobId={jobId} apiBase={apiBase} />
              </div>
            )}

            {activePanel === "cochange" && jobId && (
              <div className="card">
                <h2>Buddy files</h2>
                <p className="card-hint">Files that get edited together — change one, check the other.</p>
                <CoChangeTab jobId={jobId} apiBase={apiBase} />
              </div>
            )}

            <HealthReceipt modules={modules} repoUrl={activeRepoUrl} />
          </>
        )}
      </div>
    </div>
  );
}

