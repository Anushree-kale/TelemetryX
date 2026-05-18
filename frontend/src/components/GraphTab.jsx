import { useCallback, useEffect, useRef, useState } from "react";

const CLUSTER_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

function nodeSize(priority) {
  const p = priority || 0;
  return 20 + (p / 100) * 40;
}

export default function GraphTab({ jobId, apiBase }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [nodeDetail, setNodeDetail] = useState(null);

  const fetchNodeDetail = useCallback(
    async (filePath) => {
      const encoded = encodeURIComponent(filePath);
      const res = await fetch(`${apiBase}/graph/${jobId}/node/${encoded}`);
      if (!res.ok) return;
      setNodeDetail(await res.json());
    },
    [apiBase, jobId]
  );

  useEffect(() => {
    if (!jobId || !containerRef.current) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/graph/${jobId}`);
        if (!res.ok) throw new Error("Failed to load graph");
        const data = await res.json();
        if (cancelled) return;

        if (typeof window.cytoscape === "undefined") {
          throw new Error("Cytoscape.js not loaded");
        }

        const graph = data.graph_json;
        const elements = [];

        for (const node of graph.nodes || []) {
          const id = node.id;
          const priority = node.priority_score || node.debt_score || 0;
          const clusterId = node.cluster_id ?? 0;
          const size = nodeSize(priority);
          elements.push({
            data: {
              id,
              label: id.split("/").pop(),
              priority_score: priority,
              debt_score: node.debt_score,
              cluster_id: clusterId,
              in_degree: node.in_degree,
              size,
              color: CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length],
            },
            classes: node.is_critical ? "critical" : "",
          });
        }

        for (const edge of graph.links || []) {
          const src = typeof edge.source === "object" ? edge.source.id : edge.source;
          const tgt = typeof edge.target === "object" ? edge.target.id : edge.target;
          const edgeType = edge.type || "import";
          elements.push({
            data: {
              id: `${src}->${tgt}-${edgeType}`,
              source: src,
              target: tgt,
              edgeType,
              weight: edge.weight || 1,
            },
          });
        }

        if (cyRef.current) {
          cyRef.current.destroy();
        }

        const cy = window.cytoscape({
          container: containerRef.current,
          elements,
          style: [
            {
              selector: "node",
              style: {
                width: "data(size)",
                height: "data(size)",
                "background-color": "data(color)",
                label: "data(label)",
                "font-size": 8,
                color: "#94a3b8",
                "text-valign": "bottom",
                "text-margin-y": 4,
                "border-width": 1,
                "border-color": "#fbbf24",
              },
            },
            {
              selector: "node.critical",
              style: { "border-width": 3 },
            },
            {
              selector: 'edge[edgeType = "import"]',
              style: {
                width: 1.5,
                "line-color": "#3b82f6",
                "target-arrow-color": "#3b82f6",
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
              },
            },
            {
              selector: 'edge[edgeType = "co_change"]',
              style: {
                width: 2,
                "line-color": "#a855f7",
                "line-style": "dashed",
                "curve-style": "bezier",
              },
            },
            {
              selector: "node:selected",
              style: {
                "border-width": 4,
                "border-color": "#60a5fa",
              },
            },
          ],
          layout: { name: "cose", animate: true, padding: 40 },
        });

        cy.on("tap", "node", (evt) => {
          const fp = evt.target.id();
          setSelected(fp);
          fetchNodeDetail(fp);
        });

        cyRef.current = cy;
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    init();
    return () => {
      cancelled = true;
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [jobId, apiBase, fetchNodeDetail]);

  return (
    <div className="graph-tab card">
      <div className="graph-tab-header">
        <h2>Dependency Graph</h2>
        <div className="graph-legend-group">
          <span className="graph-legend-item">
            <span className="legend-line import-solid" /> Import
          </span>
          <span className="graph-legend-item">
            <span className="legend-line coupling-dashed" /> Co-Change
          </span>
        </div>
      </div>
      {loading && <p className="graph-tab-status">Loading graph…</p>}
      {error && <p className="graph-tab-error">⚠️ {error}</p>}
      <div className="graph-tab-body">
        <div ref={containerRef} className="cytoscape-container" />
        {selected && nodeDetail && (
          <aside className="graph-side-panel">
            <h3>{selected.split("/").pop()}</h3>
            <code className="graph-panel-path">{selected}</code>
            <div className="graph-panel-stats">
              <div>
                <span className="stat-num">{nodeDetail.debt_score?.toFixed(1)}</span>
                <span className="stat-lbl">Debt</span>
              </div>
              <div>
                <span className="stat-num">{nodeDetail.priority_score?.toFixed(1)}</span>
                <span className="stat-lbl">Priority</span>
              </div>
              <div>
                <span className="stat-num">{nodeDetail.in_degree}</span>
                <span className="stat-lbl">In-degree</span>
              </div>
              <div>
                <span className="stat-num">{nodeDetail.downstream_count}</span>
                <span className="stat-lbl">Downstream</span>
              </div>
            </div>
            <div className="graph-panel-lists">
              <div>
                <h4>Importers</h4>
                <ul>
                  {(nodeDetail.importers || []).slice(0, 12).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {(nodeDetail.importers || []).length === 0 && (
                    <li className="muted">None</li>
                  )}
                </ul>
              </div>
              <div>
                <h4>Importees</h4>
                <ul>
                  {(nodeDetail.importees || []).slice(0, 12).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {(nodeDetail.importees || []).length === 0 && (
                    <li className="muted">None</li>
                  )}
                </ul>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
