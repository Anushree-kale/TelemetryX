import { useRef, useState } from "react";
import ProgressBar from "./ProgressBar";

const POLL_INTERVAL_MS = 1500;

export default function AnalyzeForm({ apiBase, onComplete, onStatusChange }) {
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
            reject(
              new Error(data.error_detail || "Analysis job failed"),
            );
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

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ margin: "0 0 1rem" }}>Analyze Repository</h2>
      <div className="analyze-row">
        <input
          type="url"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={loading}
          className="input-url"
        />
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>
      {loading && (
        <div style={{ marginTop: "1rem" }}>
          <ProgressBar pct={progress.pct} message={progress.message} />
        </div>
      )}
      {error && <p className="status error">{error}</p>}
    </form>
  );
}
