import { useRef, useState } from "react";

const POLL_INTERVAL_MS = 2000;

export default function AnalyzeForm({ apiBase, onComplete, onStatusChange }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollResults = (jobId) =>
    new Promise((resolve, reject) => {
      const fetchResults = async () => {
        try {
          const res = await fetch(`${apiBase}/results/${jobId}`);
          if (!res.ok) {
            throw new Error("Failed to fetch job results");
          }
          const data = await res.json();
          onStatusChange?.(data.status);

          if (data.status === "complete") {
            stopPolling();
            resolve(data);
          } else if (data.status === "failed") {
            stopPolling();
            reject(new Error("Analysis job failed"));
          }
        } catch (err) {
          stopPolling();
          reject(err);
        }
      };

      fetchResults();
      pollRef.current = setInterval(fetchResults, POLL_INTERVAL_MS);
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
    onStatusChange?.("running");

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
        const data = await pollResults(jobId);
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
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <input
          type="url"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={loading}
          style={{
            flex: "1 1 280px",
            padding: "0.6rem 0.85rem",
            borderRadius: "6px",
            border: "1px solid #2a3548",
            background: "#0f1419",
            color: "#e7ecf3",
            fontSize: "0.95rem",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.6rem 1.25rem",
            borderRadius: "6px",
            border: "none",
            background: loading ? "#3b4a63" : "#3b82f6",
            color: "#fff",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>
      {error && <p className="status error">{error}</p>}
    </form>
  );
}
