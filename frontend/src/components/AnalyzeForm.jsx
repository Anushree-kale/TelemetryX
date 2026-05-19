import { useRef, useState } from "react";
import ProgressBar from "./ProgressBar";

const POLL_INTERVAL_MS = 1500;

export default function AnalyzeForm({
  apiBase,
  knownRepos = [],
  onComplete,
  onStatusChange,
}) {
  const [repoUrl, setRepoUrl] = useState("");
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
          if (!res.ok) {
            throw new Error("Failed to fetch job status");
          }
          const data = await res.json();
          onStatusChange?.(data.status);
          setProgress({
            pct: data.progress_pct ?? 0,
            message: data.progress_message || "",
          });

          if (data.status === "complete") {
            stopPolling();
            const resultsRes = await fetch(`${apiBase}/results/${jobId}`);
            if (!resultsRes.ok) {
              throw new Error("Failed to fetch job results");
            }
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
      setError("Enter a GitHub repository URL");
      return;
    }

    setLoading(true);
    setProgress({ pct: 0, message: "Submitting…" });
    onStatusChange?.("pending");

    try {
      const res = await fetch(`${apiBase}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: url }),
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
        const data = await resultsRes.json();
        onComplete?.(data);
      } else {
        const data = await pollJobStatus(jobId);
        onComplete?.(data);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
      onStatusChange?.("failed");
    } finally {
      setLoading(false);
    }
  };

  const recentRepos = Array.isArray(knownRepos) ? knownRepos.slice(0, 12) : [];

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="analyze-form-title">Paste your GitHub repo</h2>
      <p className="card-hint analyze-form-intro">
        Drop a link below — we&apos;ll scan it for mess, bugs, churn, and what to fix first.
      </p>
      <div className="analyze-row">
        <input
          type="url"
          name="repo_url"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={loading}
          className="input-url"
          list="dashboard-repo-datalist"
          autoComplete="off"
        />
        <datalist id="dashboard-repo-datalist">
          {recentRepos.map((url) => (
            <option key={url} value={url} />
          ))}
        </datalist>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Scanning…" : "Scan repo"}
        </button>
      </div>
      {recentRepos.length > 0 && (
        <div className="known-repos-chips" aria-label="Previously analyzed repositories">
          <span className="known-repos-label">Quick select</span>
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
                  {short.length > 42 ? `${short.slice(0, 40)}…` : short}
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
