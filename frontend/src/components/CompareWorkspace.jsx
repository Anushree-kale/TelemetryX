import { useEffect, useState } from "react";
import { renderVarianceDeltas } from "./compareVariance";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function fmtDebtDiff(diff, sign) {
  return `${sign}${diff.toFixed(2)}`;
}

function fmtIntDiff(diff, sign) {
  return `${sign}${diff}`;
}

function fmtLocDiff(diff, sign) {
  return `${sign}${diff.toLocaleString()}`;
}

function fmtPctPoints(diff, sign) {
  return `${sign}${diff.toFixed(2)}%`;
}

function CompareResultsTable({ repoA, repoB, ma, mb }) {
  const debt = renderVarianceDeltas(
    mb.avg_debt_score - ma.avg_debt_score,
    ma.avg_debt_score,
    "lower_better",
    fmtDebtDiff,
  );
  const loc = renderVarianceDeltas(mb.total_loc - ma.total_loc, ma.total_loc, "neutral", fmtLocDiff);
  const risk = renderVarianceDeltas(
    mb.high_risk_count - ma.high_risk_count,
    ma.high_risk_count,
    "lower_better",
    fmtIntDiff,
  );
  const testRatioDiff = (mb.avg_test_coverage - ma.avg_test_coverage) * 100;
  const testRatio = renderVarianceDeltas(
    testRatioDiff,
    ma.avg_test_coverage * 100,
    "higher_better",
    fmtPctPoints,
    false,
  );
  const files = renderVarianceDeltas(mb.file_count - ma.file_count, ma.file_count, "neutral", fmtIntDiff);

  return (
    <div className="comparison-results-panel">
      <div className="compare-split-grid">
        <div className="compare-repo-card">
          <div className="compare-repo-header">
            <span className="repo-badge a">A</span>
            <h3 className="compare-repo-url" title={repoA.url}>
              {repoA.url.split("/").slice(-2).join("/")}
            </h3>
          </div>
          <div className="compare-repo-metrics-grid">
            <div className="metric-box">
              <span className="box-val">{ma.avg_debt_score.toFixed(1)}</span>
              <span className="box-lbl">Avg debt score</span>
            </div>
            <div className="metric-box">
              <span className="box-val">{ma.total_loc.toLocaleString()}</span>
              <span className="box-lbl">Total LOC</span>
            </div>
            <div className="metric-box">
              <span className="box-val">{ma.high_risk_count}</span>
              <span className="box-lbl">High-risk files</span>
            </div>
            <div className="metric-box">
              <span className="box-val">{(ma.avg_test_coverage * 100).toFixed(1)}%</span>
              <span className="box-lbl">Avg test file ratio</span>
            </div>
          </div>
        </div>

        <div className="compare-repo-card">
          <div className="compare-repo-header">
            <span className="repo-badge b">B</span>
            <h3 className="compare-repo-url" title={repoB.url}>
              {repoB.url.split("/").slice(-2).join("/")}
            </h3>
          </div>
          <div className="compare-repo-metrics-grid">
            <div className="metric-box">
              <span className="box-val">{mb.avg_debt_score.toFixed(1)}</span>
              <span className="box-lbl">Avg debt score</span>
            </div>
            <div className="metric-box">
              <span className="box-val">{mb.total_loc.toLocaleString()}</span>
              <span className="box-lbl">Total LOC</span>
            </div>
            <div className="metric-box">
              <span className="box-val">{mb.high_risk_count}</span>
              <span className="box-lbl">High-risk files</span>
            </div>
            <div className="metric-box">
              <span className="box-val">{(mb.avg_test_coverage * 100).toFixed(1)}%</span>
              <span className="box-lbl">Avg test file ratio</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card table-container">
        <h2>Variance Analysis Matrix (Repo A → Repo B)</h2>
        <p className="card-hint">
          Red means Repo B is worse for “lower is better” metrics; green means improvement in Repo
          B. Test file ratio is a heuristic from test vs. source line counts, not instrumented
          coverage.
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
            <tr>
              <td>
                <strong>Average technical debt score</strong>
              </td>
              <td>{ma.avg_debt_score.toFixed(2)}</td>
              <td>{mb.avg_debt_score.toFixed(2)}</td>
              <td className={debt.cls}>{debt.deltaText}</td>
              <td className={debt.cls}>{debt.pctText}</td>
            </tr>
            <tr>
              <td>
                <strong>Total lines of code (LOC)</strong>
              </td>
              <td>{ma.total_loc.toLocaleString()}</td>
              <td>{mb.total_loc.toLocaleString()}</td>
              <td className={loc.cls}>{loc.deltaText}</td>
              <td className={loc.cls}>{loc.pctText}</td>
            </tr>
            <tr>
              <td>
                <strong>High-risk hotspots count</strong>
              </td>
              <td>{ma.high_risk_count}</td>
              <td>{mb.high_risk_count}</td>
              <td className={risk.cls}>{risk.deltaText}</td>
              <td className={risk.cls}>{risk.pctText}</td>
            </tr>
            <tr>
              <td>
                <strong>Average test file ratio</strong>
              </td>
              <td>{(ma.avg_test_coverage * 100).toFixed(2)}%</td>
              <td>{(mb.avg_test_coverage * 100).toFixed(2)}%</td>
              <td className={testRatio.cls}>{testRatio.deltaText}</td>
              <td className={testRatio.cls}>—</td>
            </tr>
            <tr>
              <td>
                <strong>Total modules scanned</strong>
              </td>
              <td>{ma.file_count}</td>
              <td>{mb.file_count}</td>
              <td className={files.cls}>{files.deltaText}</td>
              <td className={files.cls}>{files.pctText}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CompareWorkspace({ repoList }) {
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState(null);

  useEffect(() => {
    if (Array.isArray(repoList) && repoList.length) {
      setCompareA((prev) => prev || repoList[0] || "");
      setCompareB((prev) => {
        if (prev) return prev;
        if (repoList.length >= 2) return repoList[1];
        return "";
      });
    }
  }, [repoList]);

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
        `${API_BASE}/repos/compare?repo_a=${encodeURIComponent(compareA)}&repo_b=${encodeURIComponent(compareB)}`,
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

  useEffect(() => {
    let timer;
    if (compareData && compareData.status === "scanning" && !compareLoading) {
      timer = setInterval(async () => {
        try {
          const res = await fetch(
            `${API_BASE}/repos/compare?repo_a=${encodeURIComponent(compareA)}&repo_b=${encodeURIComponent(compareB)}`,
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

  const ma = compareData?.status === "complete" ? compareData.repo_a?.metrics : null;
  const mb = compareData?.status === "complete" ? compareData.repo_b?.metrics : null;

  return (
    <div className="compare-workspace">
      <div className="card">
        <h2>Side-by-Side Repository Comparison</h2>
        <p className="card-hint">
          Select two analyzed repositories to inspect their metrics split-panel.
        </p>
        <form onSubmit={handleCompareSubmit} className="compare-selectors-form">
          <div className="selector-group">
            <label htmlFor="compare-a">Repository A URL</label>
            <input
              id="compare-a"
              type="text"
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              placeholder="e.g. https://github.com/octocat/Spoon-Knife"
              className="compare-input"
              list="repo-url-options-compare"
            />
          </div>
          <div className="compare-vs-divider">VS</div>
          <div className="selector-group">
            <label htmlFor="compare-b">Repository B URL</label>
            <input
              id="compare-b"
              type="text"
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              placeholder="e.g. https://github.com/Anushree-kale/TelemetryX"
              className="compare-input"
              list="repo-url-options-compare"
            />
          </div>
          <datalist id="repo-url-options-compare">
            {repoList.map((url) => (
              <option key={url} value={url} />
            ))}
          </datalist>
          <button type="submit" disabled={compareLoading} className="compare-submit-btn">
            {compareLoading ? "Comparing..." : "Compare Repositories"}
          </button>
        </form>
        {compareError && <p className="compare-error">⚠️ {compareError}</p>}
      </div>

      {compareLoading && (
        <div className="compare-loading card">
          <div className="shimmer-card compare-loading-shimmer" />
        </div>
      )}

      {compareData && compareData.status === "scanning" && !compareLoading && (
        <div className="card compare-scanning-panel">
          <h2>Repository Analysis in Progress</h2>
          <p className="card-hint">
            One or both repositories are being analyzed in the background. The comparison
            dashboard will open automatically when completed.
          </p>

          <div className="compare-split-grid compare-split-grid-spaced">
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
                    className="progress-bar-fg progress-bar-fg-a"
                    style={{ width: `${compareData.repo_a.progress_pct}%` }}
                  />
                </div>
                <span className="progress-msg">{compareData.repo_a.progress_message}</span>
              </div>
            </div>

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
                    className="progress-bar-fg progress-bar-fg-b"
                    style={{ width: `${compareData.repo_b.progress_pct}%` }}
                  />
                </div>
                <span className="progress-msg">{compareData.repo_b.progress_message}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {compareData && compareData.status === "complete" && !compareLoading && ma && mb && (
        <CompareResultsTable
          repoA={compareData.repo_a}
          repoB={compareData.repo_b}
          ma={ma}
          mb={mb}
        />
      )}
    </div>
  );
}
