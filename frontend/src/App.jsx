import { useCallback, useEffect, useState } from "react";
import AnalyzeForm from "./components/AnalyzeForm";
import DebtHeatmap from "./components/DebtHeatmap";
import MetricsChart from "./components/MetricsChart";
import ModulesTable from "./components/ModulesTable";
import SummaryCards from "./components/SummaryCards";
import DependencyGraph from "./components/DependencyGraph";
import { SummaryCardsSkeleton, ModulesTableSkeleton } from "./components/Skeletons";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard" or "compare"
  const [modules, setModules] = useState([]);
  const [status, setStatus] = useState(null);
  const [repoUrl, setRepoUrl] = useState(null);

  // Compare Tab State
  const [repoList, setRepoList] = useState([]);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState(null);

  const fetchAllModules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/modules`);
      if (!res.ok) return;
      const data = await res.json();
      setModules(data.modules || []);
    } catch {
      /* ignore on initial load */
    }
  }, []);

  useEffect(() => {
    fetchAllModules();
  }, [fetchAllModules]);

  // Load analyzed repositories list for comparison dropdowns
  useEffect(() => {
    fetch(`${API_BASE}/repos`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRepoList(data);
          if (data.length >= 2) {
            setCompareA(data[0]);
            setCompareB(data[1]);
          } else if (data.length === 1) {
            setCompareA(data[0]);
          }
        }
      })
      .catch((err) => console.error("Failed to fetch repository urls:", err));
  }, [modules]);

  const handleAnalysisComplete = (result) => {
    setModules(result.modules || []);
    setStatus(result.status);
    setRepoUrl(result.repo_url);
  };

  const handleCompareSubmit = async (e) => {
    e.preventDefault();
    if (!compareA || !compareB) {
      setCompareError("Please enter two repository URLs to compare.");
      return;
    }
    if (compareA === compareB) {
      setCompareError("Please choose two different repositories.");
      return;
    }
    setCompareLoading(true);
    setCompareError(null);
    try {
      const res = await fetch(
        `${API_BASE}/repos/compare?repo_a=${encodeURIComponent(compareA)}&repo_b=${encodeURIComponent(compareB)}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Repository comparison failed");
      }
      const data = await res.json();
      setCompareData(data);
    } catch (err) {
      setCompareError(err.message);
    } finally {
      setCompareLoading(false);
    }
  };

  // Dynamic comparative analysis polling loop
  useEffect(() => {
    let timer;
    if (compareData && compareData.status === "scanning" && !compareLoading) {
      timer = setInterval(async () => {
        try {
          const res = await fetch(
            `${API_BASE}/repos/compare?repo_a=${encodeURIComponent(compareA)}&repo_b=${encodeURIComponent(compareB)}`
          );
          if (!res.ok) return;
          const data = await res.json();
          setCompareData(data);
        } catch (err) {
          console.error("Polling comparison status error:", err);
        }
      }, 2500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [compareData, compareLoading, compareA, compareB]);

  const isAnalyzing = status === "pending" || status === "running";
  const activeRepoUrl = repoUrl || modules[0]?.repo_url;
  const currentJobId = modules[0]?.job_id;

  return (
    <div>
      <div className="app-header-container">
        <div>
          <h1>TelemetryX</h1>
          <p className="subtitle">
            Enterprise Engineering Intelligence — debt scoring &amp; explainability
          </p>
        </div>
        <div className="workspace-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            📊 Single Repo Dashboard
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "compare" ? "active" : ""}`}
            onClick={() => setActiveTab("compare")}
          >
            ⚖️ Compare Repositories
          </button>
        </div>
      </div>

      {activeTab === "dashboard" && (
        <>
          <div className="card">
            <AnalyzeForm
              apiBase={API_BASE}
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

          {isAnalyzing && (
            <>
              <SummaryCardsSkeleton />
              <ModulesTableSkeleton />
            </>
          )}

          {!isAnalyzing && modules.length === 0 && (
            <div className="empty-state card">
              <div className="empty-state-icon">🔍</div>
              <h2>Analyze your first repo</h2>
              <p>
                Enter a GitHub repository URL above to compute technical debt scores,
                view cyclomatic and cognitive complexity metrics, and get machine
                learning-powered refactoring insights.
              </p>
            </div>
          )}

          {modules.length > 0 && !isAnalyzing && (
            <>
              <SummaryCards modules={modules} repoUrl={activeRepoUrl} />

              <div className="card">
                <h2>Debt heatmap</h2>
                <p className="card-hint">
                  Block size = LOC · Color = debt score (green → amber → red)
                </p>
                <DebtHeatmap modules={modules} />
              </div>

              {currentJobId && (
                <DependencyGraph jobId={currentJobId} />
              )}

              <div className="card">
                <h2>Top 10 — Cyclomatic Complexity</h2>
                <MetricsChart modules={modules} />
              </div>

              <div className="card">
                <h2>Module metrics</h2>
                <ModulesTable modules={modules} />
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "compare" && (
        <div className="compare-workspace">
          <div className="card">
            <h2>Side-by-Side Repository Comparison</h2>
            <p className="card-hint">
              Select two analyzed repositories to inspect their metrics split-panel.
            </p>
            <form onSubmit={handleCompareSubmit} className="compare-selectors-form">
              <div className="selector-group">
                <label>Repository A URL</label>
                <input
                  type="text"
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                  placeholder="e.g. https://github.com/octocat/Spoon-Knife"
                  className="compare-input"
                />
              </div>
              <div className="compare-vs-divider">VS</div>
              <div className="selector-group">
                <label>Repository B URL</label>
                <input
                  type="text"
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                  placeholder="e.g. https://github.com/Anushree-kale/TelemetryX"
                  className="compare-input"
                />
              </div>
              <button
                type="submit"
                disabled={compareLoading}
                className="compare-submit-btn"
              >
                {compareLoading ? "Comparing..." : "Compare Repositories"}
              </button>
            </form>
            {compareError && <p className="compare-error">⚠️ {compareError}</p>}
          </div>

          {compareLoading && (
            <div className="compare-loading card">
              <div className="shimmer-card" style={{ height: 160 }} />
            </div>
          )}

          {compareData && compareData.status === "scanning" && !compareLoading && (
            <div className="card compare-scanning-panel">
              <h2>Repository Analysis in Progress</h2>
              <p className="card-hint">
                One or both repositories are being analyzed in the background. The comparison dashboard will open automatically when completed.
              </p>
              
              <div className="compare-split-grid" style={{ marginTop: "1.5rem" }}>
                {/* Repo A Scan Status */}
                <div className="compare-repo-card">
                  <div className="compare-repo-header">
                    <span className="repo-badge a">A</span>
                    <h3 className="compare-repo-url" title={compareData.repo_a.url}>
                      {compareData.repo_a.url.split("/").slice(-2).join("/") || compareData.repo_a.url}
                    </h3>
                  </div>
                  <div className="scan-progress-box">
                    <div className="progress-text-row">
                      <span className="scan-status-badge">{compareData.repo_a.status.toUpperCase()}</span>
                      <span className="scan-pct">{compareData.repo_a.progress_pct}%</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div 
                        className="progress-bar-fg" 
                        style={{ width: `${compareData.repo_a.progress_pct}%`, backgroundColor: "#3b82f6" }}
                      />
                    </div>
                    <span className="progress-msg">{compareData.repo_a.progress_message}</span>
                  </div>
                </div>

                {/* Repo B Scan Status */}
                <div className="compare-repo-card">
                  <div className="compare-repo-header">
                    <span className="repo-badge b">B</span>
                    <h3 className="compare-repo-url" title={compareData.repo_b.url}>
                      {compareData.repo_b.url.split("/").slice(-2).join("/") || compareData.repo_b.url}
                    </h3>
                  </div>
                  <div className="scan-progress-box">
                    <div className="progress-text-row">
                      <span className="scan-status-badge">{compareData.repo_b.status.toUpperCase()}</span>
                      <span className="scan-pct">{compareData.repo_b.progress_pct}%</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div 
                        className="progress-bar-fg" 
                        style={{ width: `${compareData.repo_b.progress_pct}%`, backgroundColor: "#10b981" }}
                      />
                    </div>
                    <span className="progress-msg">{compareData.repo_b.progress_message}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {compareData && compareData.status === "complete" && !compareLoading && (
            <div className="comparison-results-panel">
              {/* Split Screen Cards */}
              <div className="compare-split-grid">
                {/* Repo A Dashboard Card */}
                <div className="compare-repo-card">
                  <div className="compare-repo-header">
                    <span className="repo-badge a">A</span>
                    <h3 className="compare-repo-url" title={compareData.repo_a.url}>
                      {compareData.repo_a.url.split("/").slice(-2).join("/")}
                    </h3>
                  </div>
                  <div className="compare-repo-metrics-grid">
                    <div className="metric-box">
                      <span className="box-val">{compareData.repo_a.metrics.avg_debt_score.toFixed(1)}</span>
                      <span className="box-lbl">Avg Debt Score</span>
                    </div>
                    <div className="metric-box">
                      <span className="box-val">{compareData.repo_a.metrics.total_loc.toLocaleString()}</span>
                      <span className="box-lbl">Total LOC</span>
                    </div>
                    <div className="metric-box">
                      <span className="box-val">{compareData.repo_a.metrics.high_risk_count}</span>
                      <span className="box-lbl">High Risk Files</span>
                    </div>
                    <div className="metric-box">
                      <span className="box-val">{(compareData.repo_a.metrics.avg_test_coverage * 100).toFixed(1)}%</span>
                      <span className="box-lbl">Avg Test Coverage</span>
                    </div>
                  </div>
                </div>

                {/* Repo B Dashboard Card */}
                <div className="compare-repo-card">
                  <div className="compare-repo-header">
                    <span className="repo-badge b">B</span>
                    <h3 className="compare-repo-url" title={compareData.repo_b.url}>
                      {compareData.repo_b.url.split("/").slice(-2).join("/")}
                    </h3>
                  </div>
                  <div className="compare-repo-metrics-grid">
                    <div className="metric-box">
                      <span className="box-val">{compareData.repo_b.metrics.avg_debt_score.toFixed(1)}</span>
                      <span className="box-lbl">Avg Debt Score</span>
                    </div>
                    <div className="metric-box">
                      <span className="box-val">{compareData.repo_b.metrics.total_loc.toLocaleString()}</span>
                      <span className="box-lbl">Total LOC</span>
                    </div>
                    <div className="metric-box">
                      <span className="box-val">{compareData.repo_b.metrics.high_risk_count}</span>
                      <span className="box-lbl">High Risk Files</span>
                    </div>
                    <div className="metric-box">
                      <span className="box-val">{(compareData.repo_b.metrics.avg_test_coverage * 100).toFixed(1)}%</span>
                      <span className="box-lbl">Avg Test Coverage</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Core Comparative Difference Table */}
              <div className="card table-container">
                <h2>Variance Analysis Matrix (Repo A → Repo B)</h2>
                <p className="card-hint">
                  Visualizing variance thresholds from Repo A to Repo B. Red indicates higher debt in Repo B; Green indicates improvement in Repo B.
                </p>
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Metric Category</th>
                      <th>Repo A</th>
                      <th>Repo B</th>
                      <th>Variance Delta</th>
                      <th>Percentage Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 1. Avg Debt Score */}
                    <tr>
                      <td><strong>Average Technical Debt Score</strong></td>
                      <td>{compareData.repo_a.metrics.avg_debt_score.toFixed(2)}</td>
                      <td>{compareData.repo_b.metrics.avg_debt_score.toFixed(2)}</td>
                      {(() => {
                        const diff = compareData.repo_b.metrics.avg_debt_score - compareData.repo_a.metrics.avg_debt_score;
                        const sign = diff > 0 ? "+" : "";
                        const cls = diff > 0 ? "negative-delta" : diff < 0 ? "positive-delta" : "neutral-delta";
                        const pct = compareData.repo_a.metrics.avg_debt_score > 0
                          ? `${sign}${((diff / compareData.repo_a.metrics.avg_debt_score) * 100).toFixed(1)}%`
                          : "—";
                        return (
                          <>
                            <td className={cls}>{sign}{diff.toFixed(2)}</td>
                            <td className={cls}>{pct}</td>
                          </>
                        );
                      })()}
                    </tr>

                    {/* 2. Total LOC */}
                    <tr>
                      <td><strong>Total Lines of Code (LOC)</strong></td>
                      <td>{compareData.repo_a.metrics.total_loc.toLocaleString()}</td>
                      <td>{compareData.repo_b.metrics.total_loc.toLocaleString()}</td>
                      {(() => {
                        const diff = compareData.repo_b.metrics.total_loc - compareData.repo_a.metrics.total_loc;
                        const sign = diff > 0 ? "+" : "";
                        const cls = "neutral-delta"; // lines of code is neutral size variance
                        const pct = compareData.repo_a.metrics.total_loc > 0
                          ? `${sign}${((diff / compareData.repo_a.metrics.total_loc) * 100).toFixed(1)}%`
                          : "—";
                        return (
                          <>
                            <td className={cls}>{sign}{diff.toLocaleString()}</td>
                            <td className={cls}>{pct}</td>
                          </>
                        );
                      })()}
                    </tr>

                    {/* 3. High Risk Files */}
                    <tr>
                      <td><strong>High Risk Hotspots count</strong></td>
                      <td>{compareData.repo_a.metrics.high_risk_count}</td>
                      <td>{compareData.repo_b.metrics.high_risk_count}</td>
                      {(() => {
                        const diff = compareData.repo_b.metrics.high_risk_count - compareData.repo_a.metrics.high_risk_count;
                        const sign = diff > 0 ? "+" : "";
                        const cls = diff > 0 ? "negative-delta" : diff < 0 ? "positive-delta" : "neutral-delta";
                        const pct = compareData.repo_a.metrics.high_risk_count > 0
                          ? `${sign}${((diff / compareData.repo_a.metrics.high_risk_count) * 100).toFixed(1)}%`
                          : "—";
                        return (
                          <>
                            <td className={cls}>{sign}{diff}</td>
                            <td className={cls}>{pct}</td>
                          </>
                        );
                      })()}
                    </tr>

                    {/* 4. Average Test Coverage */}
                    <tr>
                      <td><strong>Average Test Coverage Ratio</strong></td>
                      <td>{(compareData.repo_a.metrics.avg_test_coverage * 100).toFixed(2)}%</td>
                      <td>{(compareData.repo_b.metrics.avg_test_coverage * 100).toFixed(2)}%</td>
                      {(() => {
                        const diff = (compareData.repo_b.metrics.avg_test_coverage - compareData.repo_a.metrics.avg_test_coverage) * 100;
                        const sign = diff > 0 ? "+" : "";
                        // For coverage, positive is good (green), negative is bad (red)
                        const cls = diff > 0 ? "positive-delta" : diff < 0 ? "negative-delta" : "neutral-delta";
                        return (
                          <>
                            <td className={cls}>{sign}{diff.toFixed(2)}%</td>
                            <td className={cls}>—</td>
                          </>
                        );
                      })()}
                    </tr>

                    {/* 5. Total Files Count */}
                    <tr>
                      <td><strong>Total Modules Scanned</strong></td>
                      <td>{compareData.repo_a.metrics.file_count}</td>
                      <td>{compareData.repo_b.metrics.file_count}</td>
                      {(() => {
                        const diff = compareData.repo_b.metrics.file_count - compareData.repo_a.metrics.file_count;
                        const sign = diff > 0 ? "+" : "";
                        const cls = "neutral-delta";
                        const pct = compareData.repo_a.metrics.file_count > 0
                          ? `${sign}${((diff / compareData.repo_a.metrics.file_count) * 100).toFixed(1)}%`
                          : "—";
                        return (
                          <>
                            <td className={cls}>{sign}{diff}</td>
                            <td className={cls}>{pct}</td>
                          </>
                        );
                      })()}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
