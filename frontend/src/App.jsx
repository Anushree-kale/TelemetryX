import { useCallback, useEffect, useState } from "react";
import AnalyzeForm from "./components/AnalyzeForm";
import MetricsChart from "./components/MetricsChart";
import ModulesTable from "./components/ModulesTable";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [modules, setModules] = useState([]);
  const [status, setStatus] = useState(null);
  const [repoUrl, setRepoUrl] = useState(null);

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

  const handleAnalysisComplete = (result) => {
    setModules(result.modules || []);
    setStatus(result.status);
    setRepoUrl(result.repo_url);
    fetchAllModules();
  };

  return (
    <div>
      <h1>TelemetryX</h1>
      <p className="subtitle">Enterprise Engineering Intelligence — Week 1 MVP</p>

      <div className="card">
        <AnalyzeForm
          apiBase={API_BASE}
          onComplete={handleAnalysisComplete}
          onStatusChange={setStatus}
        />
        {status && (
          <p className={`status ${status}`}>
            {status === "running" && "Analyzing repository…"}
            {status === "complete" && repoUrl && `Analysis complete: ${repoUrl}`}
            {status === "failed" && "Analysis failed. Check the repo URL and try again."}
            {status === "pending" && "Job queued…"}
          </p>
        )}
      </div>

      {modules.length > 0 && (
        <>
          <div className="card">
            <h2>Top 10 — Cyclomatic Complexity</h2>
            <MetricsChart modules={modules} />
          </div>
          <div className="card">
            <h2>Module Metrics</h2>
            <ModulesTable modules={modules} />
          </div>
        </>
      )}
    </div>
  );
}
