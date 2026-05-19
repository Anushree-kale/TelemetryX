import { useCallback, useEffect, useState } from "react";

function rankBadgeClass(rank) {
  if (rank <= 3) return "rank-badge rank-red";
  if (rank <= 6) return "rank-badge rank-amber";
  return "rank-badge rank-gray";
}

function MiniBar({ label, value, color }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="mini-bar-row">
      <span className="mini-bar-label">{label}</span>
      <div className="mini-bar-track">
        <div
          className="mini-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="mini-bar-pct">{pct.toFixed(0)}</span>
    </div>
  );
}

function RoadmapCard({ item, maxDownstream, onCriticalToggle }) {
  const [toggling, setToggling] = useState(false);
  const filename = item.file_path?.split("/").pop() || item.file_path;
  const downstreamFiles = Array.isArray(item.downstream_files)
    ? item.downstream_files
    : [];

  const handleCritical = async () => {
    setToggling(true);
    try {
      await onCriticalToggle(item.module_id, !item.is_critical);
    } finally {
      setToggling(false);
    }
  };

  const copyJira = () => {
    const title = `[DEBT] Refactor ${filename}`;
    const body = [
      `*Description:* ${item.reason}`,
      "",
      "*Acceptance Criteria:*",
      "- Cyclomatic complexity reduced",
      "- Test coverage > 60%",
      "- Debt score < 40",
    ].join("\n");
    navigator.clipboard.writeText(`${title}\n\n${body}`);
  };

  const debt = item.debt_score || 0;
  const impact = ((item.downstream_count || 0) / Math.max(maxDownstream, 1)) * 100;
  const effortInv = Math.max(0, 100 - ((item.roi_days || 0) / 30) * 100);
  const stability = Math.max(0, 100 - (item.bug_fix_ratio || 0) * 100);

  return (
    <div className="roadmap-card">
      <div className="roadmap-card-header">
        <span className={rankBadgeClass(item.rank)}>#{item.rank}</span>
        <button
          type="button"
          className={`star-toggle ${item.is_critical ? "active" : ""}`}
          onClick={handleCritical}
          disabled={toggling}
          title="Mark as critical"
        >
          {item.is_critical ? "★" : "☆"}
        </button>
      </div>
      <code className="roadmap-filepath">{item.file_path}</code>
      <div className="roadmap-score-row">
        <span className="roadmap-priority">{item.priority_score?.toFixed(1)}</span>
        <span className="roadmap-confidence">± {item.confidence_margin?.toFixed(1)}</span>
      </div>
      <div className="roadmap-mini-bars">
        <MiniBar label="Debt" value={debt} color="#ef4444" />
        <MiniBar label="Impact" value={impact} color="#3b82f6" />
        <MiniBar label="Effort" value={effortInv} color="#10b981" />
        <MiniBar label="Stability" value={stability} color="#f59e0b" />
      </div>
      <p className="roadmap-cascade">
        Unblocks {item.cascade_benefit?.toFixed(0)} debt points across{" "}
        {item.downstream_count} modules
      </p>
      {downstreamFiles.length > 0 && (
        <details className="roadmap-downstream-details">
          <summary>Downstream files ({downstreamFiles.length})</summary>
          <ul className="roadmap-downstream-list">
            {downstreamFiles.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="roadmap-reason">{item.reason}</p>
      <div className="roadmap-actions">
        <span className="roadmap-fix-hours">{item.fix_hours?.toFixed(0)}h est.</span>
        <button type="button" className="btn-jira" onClick={copyJira}>
          Copy as Jira ticket
        </button>
      </div>
    </div>
  );
}

export default function RoadmapTab({ jobId, apiBase }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRoadmap = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/roadmap/${jobId}`);
      if (!res.ok) throw new Error("Failed to load roadmap");
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, apiBase]);

  useEffect(() => {
    fetchRoadmap();
  }, [fetchRoadmap]);

  const handleCriticalToggle = async (moduleId, isCritical) => {
    const res = await fetch(`${apiBase}/modules/${moduleId}/critical`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_critical: isCritical }),
    });
    if (!res.ok) throw new Error("Failed to update critical flag");
    const data = await res.json();
    setItems(data.items || []);
  };

  if (loading) {
    return (
      <div className="tab-loading card">
        <p>Loading fix roadmap…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tab-error card">
        <p>⚠️ {error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state card">
        <p>No roadmap items yet. Re-run analysis to generate priorities.</p>
      </div>
    );
  }

  const maxDownstream = Math.max(...items.map((i) => i.downstream_count || 0), 1);

  return (
    <div className="roadmap-grid">
      {items.map((item) => (
        <RoadmapCard
          key={item.module_id}
          item={item}
          maxDownstream={maxDownstream}
          onCriticalToggle={handleCriticalToggle}
        />
      ))}
    </div>
  );
}
