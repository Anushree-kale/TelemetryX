import { useCallback, useEffect, useState } from "react";

const CLUSTER_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

export default function ClustersTab({ jobId, apiBase }) {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClusters = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/clusters/${jobId}`);
      if (!res.ok) throw new Error("Failed to load clusters");
      const data = await res.json();
      setClusters(data.clusters || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, apiBase]);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  if (loading) {
    return (
      <div className="tab-loading card">
        <p>Loading clusters…</p>
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

  if (clusters.length === 0) {
    return (
      <div className="empty-state card">
        <p>No clusters found. Re-run analysis to detect module communities.</p>
      </div>
    );
  }

  return (
    <div className="clusters-grid">
      {clusters.map((cluster) => (
        <div key={cluster.cluster_id} className="cluster-card">
          <div className="cluster-card-header">
            <span
              className="cluster-dot"
              style={{
                background: CLUSTER_PALETTE[cluster.cluster_id % CLUSTER_PALETTE.length],
              }}
            />
            <div>
              <h3 className="cluster-name">{cluster.name}</h3>
              <span className="cluster-id-label">Cluster {cluster.cluster_id}</span>
            </div>
          </div>
          <div className="cluster-metrics">
            <div className="cluster-metric">
              <span className="cluster-metric-val">{cluster.file_count}</span>
              <span className="cluster-metric-lbl">Files</span>
            </div>
            <div className="cluster-metric">
              <span className="cluster-metric-val">{cluster.avg_debt_score}</span>
              <span className="cluster-metric-lbl">Avg Debt</span>
            </div>
            <div className="cluster-metric">
              <span className="cluster-metric-val">
                {cluster.cross_cluster_edge_count}
              </span>
              <span className="cluster-metric-lbl">Cross-cluster edges</span>
            </div>
          </div>
          <div className="cluster-priority">
            <span className="cluster-priority-lbl">Highest priority</span>
            <code>{cluster.highest_priority_file}</code>
            <span className="cluster-priority-score">
              {cluster.highest_priority_score?.toFixed(1)}
            </span>
          </div>
          <details className="cluster-files">
            <summary>View files ({cluster.file_count})</summary>
            <ul>
              {cluster.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}
