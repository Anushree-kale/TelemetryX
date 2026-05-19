import { useCallback, useEffect, useState } from "react";
import CompareWorkspace from "./components/CompareWorkspace";
import DashboardWorkspace from "./components/DashboardWorkspace";
import DeveloperTools from "./components/DeveloperTools";
import { APP_TAGLINE } from "./labels";

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

  const isDashboard = activeTab === "dashboard";

  return (
    <div className={`app-shell${isDashboard ? " app-shell--dashboard" : ""}`}>
      <header className="app-header">
        <div className="app-brand">
          <h1>TelemetryX</h1>
          <p className="subtitle">{APP_TAGLINE}</p>
        </div>
        <div className="workspace-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Analyse
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "compare" ? "active" : ""}`}
            onClick={() => setActiveTab("compare")}
          >
            Compare two
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "tools" ? "active" : ""}`}
            onClick={() => setActiveTab("tools")}
          >
            Hooks &amp; model
          </button>
        </div>
      </header>

      <main className="app-main">
        {activeTab === "dashboard" && (
          <DashboardWorkspace
            apiBase={API_BASE}
            repoList={repoList}
            onReposChanged={refreshRepoList}
          />
        )}

        {activeTab === "compare" && <CompareWorkspace repoList={repoList} />}

        {activeTab === "tools" && <DeveloperTools apiBase={API_BASE} />}
      </main>
    </div>
  );
}
