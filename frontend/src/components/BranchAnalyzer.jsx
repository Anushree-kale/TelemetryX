import { useState, useEffect, useRef } from "react";

const STATUS_META = {
  clean: {
    label: "Clean",
    color: "#22c55e",
    hint: "Branch touches no files compared to base",
  },
  analyzed: {
    label: "Analysed",
    color: "#818cf8",
    hint: "LLM summary generated",
  },
  no_baseline: {
    label: "No baseline",
    color: "#f59e0b",
    hint: "Run a full repo scan first",
  },
  error: {
    label: "Error",
    color: "#ef4444",
    hint: "Something went wrong",
  },
};

const RISK_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };

function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status, color: "#8b9cb3", hint: "" };
  return (
    <span
      className="risk-pill"
      style={{ background: meta.color, fontSize: "0.75rem", letterSpacing: "0.05em" }}
      title={meta.hint}
    >
      {meta.label.toUpperCase()}
    </span>
  );
}

export default function BranchAnalyzer({ apiBase, repoUrl }) {
  const [branchName, setBranchName] = useState("");
  const [localRepo, setLocalRepo] = useState(repoUrl || "");
  const [phase, setPhase] = useState("idle"); // idle | polling | done | error
  const [pollMsg, setPollMsg] = useState("");
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef(null);

  // Keep localRepo in sync if parent repo changes
  useEffect(() => {
    if (repoUrl) setLocalRepo(repoUrl);
  }, [repoUrl]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollResult = async (jobId) => {
    try {
      const res = await fetch(`${apiBase}/analyze/branch/${jobId}/result`);
      if (res.status === 202) {
        const data = await res.json();
        setPollMsg(data.progress_message || "Analysing...");
        return; // still pending
      }
      stopPolling();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.detail || `Server error ${res.status}`);
        setPhase("error");
        return;
      }
      const data = await res.json();
      setResult(data);
      setPhase("done");
    } catch (err) {
      stopPolling();
      setErrorMsg(err.message || "Network error");
      setPhase("error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!branchName.trim() || !localRepo.trim()) return;

    setPhase("polling");
    setPollMsg("Submitting job...");
    setResult(null);
    setErrorMsg("");
    stopPolling();

    try {
      const res = await fetch(`${apiBase}/analyze/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: localRepo.trim(),
          branch_name: branchName.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Server error ${res.status}`);
      }
      const { job_id } = await res.json();
      setPollMsg("Cloning repo (blobless)...");
      pollRef.current = setInterval(() => pollResult(job_id), 2000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit job");
      setPhase("error");
    }
  };

  const handleReset = () => {
    stopPolling();
    setPhase("idle");
    setResult(null);
    setErrorMsg("");
    setBranchName("");
  };

  const isLoading = phase === "polling";

  return (
    <div className="branch-analyzer">
      {/* Header */}
      <div className="card-heading-row" style={{ marginBottom: "1.25rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>PR / Branch noise</h2>
          <p className="card-hint" style={{ margin: "0.25rem 0 0" }}>
            Cross-reference a branch`s touched files against the current baseline`s open findings.
          </p>
        </div>
        {phase !== "idle" && (
          <button type="button" className="tx-btn-ghost" onClick={handleReset}>
            RESET
          </button>
        )}
      </div>

      {/* Input form */}
      {(phase === "idle" || phase === "error") && (
        <form
          className="branch-form"
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 560 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label htmlFor="branch-repo-url" className="toolbar-label">
              Repository URL
            </label>
            <input
              id="branch-repo-url"
              name="repo_url"
              type="url"
              className="tx-input"
              value={localRepo}
              onChange={(e) => setLocalRepo(e.target.value)}
              placeholder="https://github.com/owner/repo"
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label htmlFor="branch-name-input" className="toolbar-label">
              Branch name
            </label>
            <input
              id="branch-name-input"
              name="branch_name"
              type="text"
              className="tx-input"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="feature/my-branch"
              required
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {errorMsg && (
            <p style={{ color: "#ef4444", fontSize: "0.8rem", margin: 0 }}>{errorMsg}</p>
          )}

          <button
            type="submit"
            className="tx-btn-primary"
            disabled={!branchName.trim() || !localRepo.trim()}
          >
            Analyse branch
          </button>
        </form>
      )}

      {/* Polling / loading state */}
      {isLoading && (
        <div className="branch-loading" style={{ padding: "2rem 0", textAlign: "center" }}>
          <div className="tx-spinner" aria-label="Analysing" />
          <p className="tx-scan-message" style={{ marginTop: "1rem" }}>
            {pollMsg}
          </p>
          <p style={{ color: "#4a5568", fontSize: "0.75rem", marginTop: "0.5rem" }}>
            This may take 30-90 s for large repos. The LLM call runs after the clone.
          </p>
        </div>
      )}

      {/* Result */}
      {phase === "done" && result && (
        <div className="branch-result" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Summary card */}
          <div className="card" style={{ padding: "1.25rem", background: "var(--surface-2, rgba(255,255,255,0.04))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <StatusPill status={result.status} />
              <span className="toolbar-label" style={{ opacity: 0.6 }}>
                {result.branch}
              </span>
              {result.touched_file_count != null && (
                <span className="toolbar-label" style={{ whiteSpace: "nowrap", opacity: 0.5, marginLeft: "auto" }}>
                  {result.touched_file_count} file{result.touched_file_count !== 1 ? "s" : ""} touched
                </span>
              )}
            </div>
            <p style={{ margin: 0, lineHeight: 1.6, color: "var(--text-primary, #e2e8f0)" }}>
              {result.summary}
            </p>
          </div>

          {/* Unstable files */}
          {result.touched_unstable_files && result.touched_unstable_files.length > 0 && (
            <div>
              <p className="toolbar-label" style={{ marginBottom: "0.6rem" }}>
                Unstable files touched ({result.touched_unstable_files.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {result.touched_unstable_files.map((file, i) => (
                  <div
                    key={file.file_path || i}
                    className="card"
                    style={{
                      padding: "0.75rem 1rem",
                      background: "var(--surface-2, rgba(255,255,255,0.04))",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span
                        className="risk-pill"
                        style={{
                          background: RISK_COLORS[file.risk_level] || RISK_COLORS.low,
                          fontSize: "0.7rem",
                        }}
                      >
                        {(file.risk_level || "?").toUpperCase()}
                      </span>
                      <code
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-primary, #e2e8f0)",
                          wordBreak: "break-all",
                          flex: 1,
                        }}
                      >
                        {file.file_path}
                      </code>
                      {file.debt_score != null && (
                        <span
                          className="toolbar-label"
                          style={{ whiteSpace: "nowrap", opacity: 0.7, fontSize: "0.75rem" }}
                          title="Debt score"
                        >
                          debt {Number(file.debt_score).toFixed(1)}
                        </span>
                      )}
                    </div>
                    {file.findings && file.findings.length > 0 && (
                      <ul
                        style={{
                          margin: "0.2rem 0 0 0",
                          paddingLeft: "1.1rem",
                          fontSize: "0.78rem",
                          color: "#94a3b8",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.15rem",
                        }}
                      >
                        {file.findings.map((f, fi) => (
                          <li key={fi}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.touched_unstable_files &&
            result.touched_unstable_files.length === 0 &&
            result.status === "analyzed" && (
              <p style={{ color: "#22c55e", fontSize: "0.85rem" }}>
                No unstable files touched - this branch has a clean overlap with the baseline.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
