import { useCallback, useEffect, useState } from "react";
import DashboardWorkspace from "./components/DashboardWorkspace";
import DeveloperTools from "./components/DeveloperTools";
import InterfaceBackground from "./components/InterfaceBackground";
import { apiFetch } from "./api";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [repoList, setRepoList] = useState([]);

  const refreshRepoList = useCallback(() => {
    apiFetch(API_BASE, "/repos")
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
    <InterfaceBackground className="app-shell-wrap">
      <div className="app-shell app-shell--dashboard">
        <header className="app-header">
          <div className="app-brand">
            <span className="app-brand-mark">TX</span>
            <h1>TelemetryX</h1>
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

          {activeTab === "tools" && <DeveloperTools apiBase={API_BASE} />}
        </main>
      </div>
    </InterfaceBackground>
  );
}
