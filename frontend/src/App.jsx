import { useCallback, useEffect, useState } from "react";
import CompareWorkspace from "./components/CompareWorkspace";
import DashboardWorkspace from "./components/DashboardWorkspace";
import DeveloperTools from "./components/DeveloperTools";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [repoList, setRepoList] = useState([]);

  const refreshRepoList = useCallback(() => {
    fetch(`${API_BASE}/repos`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setRepoList(data);
      })
      .catch((err) => console.error("Failed to fetch repository urls:", err));
  }, []);

  useEffect(() => {
    refreshRepoList();
  }, [refreshRepoList]);

  return (
    <div>
      <div className="app-header-container">
        <div>
          <h1>TelemetryX</h1>
          <p className="subtitle">
            Enterprise engineering intelligence — debt scoring with plain-English explanations
          </p>
        </div>
        <div className="workspace-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Single repo dashboard
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "compare" ? "active" : ""}`}
            onClick={() => setActiveTab("compare")}
          >
            Compare repositories
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "tools" ? "active" : ""}`}
            onClick={() => setActiveTab("tools")}
          >
            Integrations &amp; model
          </button>
        </div>
      </div>

      {activeTab === "dashboard" && (
        <DashboardWorkspace
          apiBase={API_BASE}
          repoList={repoList}
          onReposChanged={refreshRepoList}
        />
      )}

      {activeTab === "compare" && <CompareWorkspace repoList={repoList} />}

      {activeTab === "tools" && <DeveloperTools apiBase={API_BASE} />}
    </div>
  );
}
