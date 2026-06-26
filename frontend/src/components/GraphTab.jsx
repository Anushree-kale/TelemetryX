import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CLUSTER_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

const RISK_NODE_COLORS = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const FOCUSED_NODE_LIMIT = 36;
const FOCUSED_GRAPH_THRESHOLD = 45;

let fcoseRegistered = false;

function registerFcose() {
  if (fcoseRegistered || typeof window.cytoscape === "undefined") return false;
  const ext = window.cytoscapeFcose;
  if (!ext) return false;
  window.cytoscape.use(ext);
  fcoseRegistered = true;
  return true;
}

function nodeSize(priority) {
  const p = priority || 0;
  return 14 + (p / 100) * 28;
}

function pickFocusedNodes(nodes) {
  const ranked = [...nodes].sort(
    (a, b) =>
      (b.priority_score || b.debt_score || 0) - (a.priority_score || a.debt_score || 0),
  );
  return new Set(ranked.slice(0, FOCUSED_NODE_LIMIT).map((n) => n.id));
}

function buildGraphElements(graph, { colorBy, showCoChange, viewMode }) {
  const nodes = graph.nodes || [];
  const links = graph.links || [];
  const useFocused = viewMode === "focused";
  const focusSeeds = useFocused ? pickFocusedNodes(nodes) : null;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const visibleIds = new Set();

  if (useFocused && focusSeeds) {
    for (const id of focusSeeds) {
      visibleIds.add(id);
    }
    for (const edge of links) {
      const src = typeof edge.source === "object" ? edge.source.id : edge.source;
      const tgt = typeof edge.target === "object" ? edge.target.id : edge.target;
      const edgeType = edge.type || "import";
      if (edgeType === "co_change" && !showCoChange) continue;
      if (focusSeeds.has(src)) visibleIds.add(tgt);
      if (focusSeeds.has(tgt)) visibleIds.add(src);
    }
  } else {
    for (const node of nodes) visibleIds.add(node.id);
  }

  const elements = [];
  const meta = new Map();

  for (const node of nodes) {
    if (!visibleIds.has(node.id)) continue;
    const id = node.id;
    const priority = node.priority_score || node.debt_score || 0;
    const clusterId = node.cluster_id ?? 0;
    const size = nodeSize(priority);
    const riskLevel = node.risk_level || "low";
    const clusterColor = CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length];
    const riskColor = RISK_NODE_COLORS[riskLevel] || RISK_NODE_COLORS.low;
    meta.set(id, { risk_level: riskLevel, cluster_id: clusterId });
    elements.push({
      data: {
        id,
        label: id.split("/").pop(),
        priority_score: priority,
        debt_score: node.debt_score,
        cluster_id: clusterId,
        in_degree: node.in_degree,
        risk_level: riskLevel,
        size,
        color: colorBy === "risk" ? riskColor : clusterColor,
      },
      classes: node.is_critical ? "critical" : "",
    });
  }

  for (const edge of links) {
    const src = typeof edge.source === "object" ? edge.source.id : edge.source;
    const tgt = typeof edge.target === "object" ? edge.target.id : edge.target;
    const edgeType = edge.type || "import";
    if (edgeType === "co_change" && !showCoChange) continue;
    if (!visibleIds.has(src) || !visibleIds.has(tgt)) continue;
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

  return { elements, meta, visibleCount: visibleIds.size, totalCount: nodes.length };
}

function graphStyles(showLabels) {
  return [
    {
      selector: "node",
      style: {
        width: "data(size)",
        height: "data(size)",
        "background-color": "data(color)",
        "background-opacity": 0.92,
        label: showLabels ? "data(label)" : "",
        "font-size": 9,
        color: "#cbd5e1",
        "text-valign": "bottom",
        "text-margin-y": 6,
        "text-max-width": 72,
        "text-wrap": "ellipsis",
        "min-zoomed-font-size": 10,
        "border-width": 1,
        "border-color": "#334155",
        "transition-property": "opacity, border-width",
        "transition-duration": 150,
      },
    },
    {
      selector: "node.hovered, node:selected",
      style: {
        label: "data(label)",
        "font-size": 10,
        "font-weight": "bold",
        color: "#f1f5f9",
        "z-index": 20,
      },
    },
    {
      selector: "node.critical",
      style: { "border-width": 2, "border-color": "#fbbf24" },
    },
    {
      selector: "node.faded",
      style: { opacity: 0.18 },
    },
    {
      selector: 'edge[edgeType = "import"]',
      style: {
        width: 1,
        opacity: 0.35,
        "line-color": "#3b82f6",
        "target-arrow-color": "#3b82f6",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.7,
        "curve-style": "unbundled-bezier",
        "control-point-distances": 28,
        "control-point-weights": 0.4,
      },
    },
    {
      selector: 'edge[edgeType = "co_change"]',
      style: {
        width: 1.25,
        opacity: 0.28,
        "line-color": "#a855f7",
        "line-style": "dashed",
        "curve-style": "unbundled-bezier",
        "control-point-distances": 40,
        "control-point-weights": 0.5,
      },
    },
    {
      selector: "edge.highlighted",
      style: {
        opacity: 0.95,
        width: 2.25,
        "z-index": 10,
      },
    },
    {
      selector: "edge.faded",
      style: { opacity: 0.06 },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#60a5fa",
      },
    },
  ];
}

function runLayout(cy, hasFcose) {
  const nodeCount = cy.nodes().length;
  const layoutName = hasFcose ? "fcose" : "cose";
  const base = {
    name: layoutName,
    fit: true,
    padding: 56,
    animate: nodeCount < 80,
    animationDuration: 450,
    nodeDimensionsIncludeLabels: true,
  };

  if (layoutName === "fcose") {
    cy.layout({
      ...base,
      quality: nodeCount > 120 ? "draft" : "default",
      randomize: true,
      packComponents: true,
      nodeSeparation: 90,
      idealEdgeLength: (edge) => (edge.data("edgeType") === "co_change" ? 160 : 110),
    }).run();
    return;
  }

  cy.layout({
    ...base,
    idealEdgeLength: 120,
    nodeOverlap: 12,
    refresh: 20,
    componentSpacing: 120,
    nodeRepulsion: 8000,
    edgeElasticity: 100,
    nestingFactor: 1.2,
    gravity: 0.2,
    numIter: 1200,
  }).run();
}

function highlightNeighborhood(cy, node) {
  cy.elements().removeClass("faded highlighted");
  if (!node) return;
  const hood = node.closedNeighborhood();
  cy.elements().not(hood).addClass("faded");
  hood.edges().addClass("highlighted");
}

export default function GraphTab({ jobId, apiBase }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const graphRef = useRef(null);
  const nodeMetaRef = useRef(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [colorBy, setColorBy] = useState("cluster");
  const [showCoChange, setShowCoChange] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [viewMode, setViewMode] = useState("focused");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ visible: 0, total: 0 });

  const fetchNodeDetail = useCallback(
    async (filePath) => {
      const encoded = encodeURIComponent(filePath);
      const res = await fetch(`${apiBase}/graph/${jobId}/node/${encoded}`);
      if (!res.ok) return;
      setNodeDetail(await res.json());
    },
    [apiBase, jobId],
  );

  const mountGraph = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !containerRef.current) return;

    const hasFcose = registerFcose();
    const { elements, meta, visibleCount, totalCount } = buildGraphElements(graph, {
      colorBy,
      showCoChange,
      viewMode,
    });
    nodeMetaRef.current = meta;
    setStats({ visible: visibleCount, total: totalCount });

    if (cyRef.current) cyRef.current.destroy();

    setSelected(null);
    setNodeDetail(null);

    const cy = window.cytoscape({
      container: containerRef.current,
      elements,
      style: graphStyles(showLabels),
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.18,
    });

    cy.on("tap", "node", (evt) => {
      const fp = evt.target.id();
      setSelected(fp);
      fetchNodeDetail(fp);
      highlightNeighborhood(cy, evt.target);
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        setSelected(null);
        setNodeDetail(null);
        cy.elements().removeClass("faded highlighted");
      }
    });

    cy.on("mouseover", "node", (evt) => {
      evt.target.addClass("hovered");
    });
    cy.on("mouseout", "node", (evt) => {
      evt.target.removeClass("hovered");
    });

    runLayout(cy, hasFcose);
    cyRef.current = cy;
  }, [colorBy, showCoChange, showLabels, viewMode, fetchNodeDetail]);

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

        graphRef.current = data.graph_json;
        const nodeCount = data.graph_json?.nodes?.length || 0;
        setViewMode(nodeCount > FOCUSED_GRAPH_THRESHOLD ? "focused" : "full");
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
  }, [jobId, apiBase]);

  useEffect(() => {
    if (loading || error || !graphRef.current) return;
    mountGraph();
  }, [loading, error, mountGraph]);

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !graphRef.current?.nodes) return [];
    return graphRef.current.nodes
      .filter((n) => n.id.toLowerCase().includes(q))
      .slice(0, 8)
      .map((n) => n.id);
  }, [search]);

  const jumpToNode = (filePath) => {
    const cy = cyRef.current;
    if (!cy) return;
    const node = cy.getElementById(filePath);
    if (!node.length) return;
    setSelected(filePath);
    fetchNodeDetail(filePath);
    highlightNeighborhood(cy, node);
    cy.animate({
      center: { eles: node },
      zoom: Math.min(1.6, cy.maxZoom()),
      duration: 280,
    });
  };

  const fitGraph = () => {
    cyRef.current?.fit(undefined, 56);
  };

  const selectedRisk = selected ? nodeMetaRef.current.get(selected)?.risk_level : null;

  return (
    <div className="graph-tab card">
      <div className="graph-tab-header">
        <div className="graph-title-container">
          <h2>Dependency Graph</h2>
          <p className="graph-subtitle">
            {stats.visible > 0
              ? `Showing ${stats.visible} of ${stats.total} modules`
              : "Import relationships between analysed modules"}
          </p>
        </div>
        <div className="graph-header-controls">
          <div className="graph-color-toggle" role="group" aria-label="View mode">
            <span className="graph-toggle-label">View</span>
            <button
              type="button"
              className={`filter-btn ${viewMode === "focused" ? "active" : ""}`}
              onClick={() => setViewMode("focused")}
              title="Top modules by debt plus direct neighbors"
            >
              Focused
            </button>
            <button
              type="button"
              className={`filter-btn ${viewMode === "full" ? "active" : ""}`}
              onClick={() => setViewMode("full")}
            >
              Full graph
            </button>
          </div>
          <div className="graph-color-toggle" role="group" aria-label="Node coloring">
            <span className="graph-toggle-label">Color</span>
            <button
              type="button"
              className={`filter-btn ${colorBy === "cluster" ? "active" : ""}`}
              onClick={() => setColorBy("cluster")}
            >
              Cluster
            </button>
            <button
              type="button"
              className={`filter-btn ${colorBy === "risk" ? "active" : ""}`}
              onClick={() => setColorBy("risk")}
            >
              Risk
            </button>
          </div>
          <label className="graph-toggle-check">
            <input
              type="checkbox"
              checked={showCoChange}
              onChange={(e) => setShowCoChange(e.target.checked)}
            />
            Co-change edges
          </label>
          <label className="graph-toggle-check">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />
            All labels
          </label>
          <div className="graph-search-wrap">
            <input
              type="search"
              className="graph-search-input"
              placeholder="Find module…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchMatches.length > 0 && (
              <ul className="graph-search-results">
                {searchMatches.map((path) => (
                  <li key={path}>
                    <button type="button" onClick={() => jumpToNode(path)}>
                      {path.split("/").pop()}
                      <span className="graph-search-path">{path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="filter-btn" onClick={fitGraph}>
            Fit view
          </button>
          <div className="graph-legend-group">
            <span className="graph-legend-item">
              <span className="legend-line import-solid" /> Import
            </span>
            {showCoChange && (
              <span className="graph-legend-item">
                <span className="legend-line coupling-dashed" /> Co-change
              </span>
            )}
          </div>
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
            {selectedRisk && (
              <p className="graph-panel-risk">
                Risk level: <strong>{selectedRisk}</strong>
              </p>
            )}
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
                <span className="stat-num">{nodeDetail.out_degree ?? 0}</span>
                <span className="stat-lbl">Out-degree</span>
              </div>
              <div>
                <span className="stat-num">{nodeDetail.downstream_count}</span>
                <span className="stat-lbl">Downstream</span>
              </div>
              <div>
                <span className="stat-num">
                  {nodeDetail.betweenness != null
                    ? Number(nodeDetail.betweenness).toFixed(3)
                    : "—"}
                </span>
                <span className="stat-lbl">Betweenness</span>
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
