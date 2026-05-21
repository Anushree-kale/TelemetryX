import { useRef, useState } from "react";
import ProgressBar from "./ProgressBar";

const POLL_INTERVAL_MS = 1500;

export default function AnalyzeForm({
  apiBase,
  knownRepos = [],
  onComplete,
  onStatusChange,
  onAnalyzeStart,
  compact = false,
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [privacyMode, setPrivacyMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ pct: 0, message: "" });
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollJobStatus = (jobId) =>
    new Promise((resolve, reject) => {
      const tick = async () => {
        try {
          const res = await fetch(`${apiBase}/jobs/${jobId}/status`);
          if (!res.ok) throw new Error("Failed to fetch job status");
          const data = await res.json();
          onStatusChange?.(data.status);
          setProgress({
            pct: data.progress_pct ?? 0,
            message: data.progress_message || "",
          });

          if (data.status === "complete") {
            stopPolling();
            const resultsRes = await fetch(`${apiBase}/results/${jobId}`);
            if (!resultsRes.ok) throw new Error("Failed to fetch job results");
            resolve(await resultsRes.json());
          } else if (data.status === "failed") {
            stopPolling();
            reject(new Error(data.error_detail || "Analysis job failed"));
          }
        } catch (err) {
          stopPolling();
          reject(err);
        }
      };

      tick();
      pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    stopPolling();

    const url = repoUrl.trim();
    if (!url) {
      setError("Enter a valid GitHub repository URL.");
      return;
    }

    setLoading(true);
    setProgress({ pct: 0, message: "Submitting analysis…" });
    onStatusChange?.("pending");
    onAnalyzeStart?.();

    try {
      const res = await fetch(`${apiBase}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: url, privacy_mode: privacyMode }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = body.detail;
        const message = Array.isArray(detail)
          ? detail.map((d) => d.msg).join(", ")
          : detail || "Analysis request failed";
        throw new Error(message);
      }

      const { job_id: jobId, status } = await res.json();
      onStatusChange?.(status);

      if (status === "complete") {
        const resultsRes = await fetch(`${apiBase}/results/${jobId}`);
        onComplete?.(await resultsRes.json());
      } else {
        onComplete?.(await pollJobStatus(jobId));
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
      onStatusChange?.("failed");
    } finally {
      setLoading(false);
    }
  };

  const recentRepos = Array.isArray(knownRepos) ? knownRepos.slice(0, 8) : [];

  return (
    <form onSubmit={handleSubmit} className={compact ? "analyze-form analyze-form--compact" : "analyze-form"}>
      {!compact && (
        <>
          <h1 className="scan-hero-title">Analyse your repository</h1>
          <p className="scan-hero-subtitle">
            Paste a GitHub URL to inspect technical debt, churn, complexity, and priority fixes.
          </p>
        </>
      )}

      <div className="scan-input-row">
        <input
          type="url"
          name="repo_url"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={loading}
          className="input-url scan-input"
          list="dashboard-repo-datalist"
          autoComplete="off"
        />
        <datalist id="dashboard-repo-datalist">
          {recentRepos.map((url) => (
            <option key={url} value={url} />
          ))}
        </datalist>
        <button type="submit" disabled={loading} className="btn-primary btn-analyze">
          {loading ? "Analysing…" : "Analyze"}
        </button>
      </div>

      <div className="privacy-toggle-row" style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          id="privacyMode"
          checked={privacyMode}
          onChange={(e) => setPrivacyMode(e.target.checked)}
          disabled={loading}
        />
        <label htmlFor="privacyMode" style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          Enable Synthetic Privacy (DP Engine)
        </label>
      </div>

      {recentRepos.length > 0 && !compact && (
        <div className="known-repos-chips">
          <span className="known-repos-label">Recent:</span>
          <div className="known-repos-buttons">
            {recentRepos.map((url) => {
              const short = url.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
              return (
                <button
                  key={url}
                  type="button"
                  className="repo-chip"
                  disabled={loading}
                  title={url}
                  onClick={() => setRepoUrl(url)}
                >
                  {short.length > 36 ? `${short.slice(0, 34)}…` : short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="analyze-progress-block">
          <ProgressBar pct={progress.pct} message={progress.message} />
        </div>
      )}
      {error && <p className="status error">{error}</p>}
    </form>
  );
}