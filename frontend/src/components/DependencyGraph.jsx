import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export default function DependencyGraph({ jobId }) {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    fetch(`http://localhost:8000/results/${jobId}/graph`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch dependency graph data");
        return res.json();
      })
      .then((json) => {
        // Calculate in-degree (how many files import this node)
        const inDegreeMap = {};
        json.links.forEach((link) => {
          const targetId = typeof link.target === "object" ? link.target.id : link.target;
          inDegreeMap[targetId] = (inDegreeMap[targetId] || 0) + 1;
        });

        const nodesWithStats = json.nodes.map((node) => ({
          ...node,
          inDegree: inDegreeMap[node.id] || 0,
        }));

        setData({ nodes: nodesWithStats, links: json.links });
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [jobId]);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous drawing

    const width = 800;
    const height = 450;

    // SVG Canvas Setup
    svg.attr("viewBox", `0 0 ${width} ${height}`)
       .attr("width", "100%")
       .attr("height", "100%")
       .style("background", "#090d12");

    // Add Arrow markers for directed links
    svg.append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18) // Distance from node center
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L9,0L0,4")
      .attr("fill", "#2e3c4e");

    const g = svg.append("g");

    // Zoom and pan support
    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Forces Setup
    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id((d) => d.id).distance(90))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide((d) => Math.max(8, Math.min(25, 6 + Math.sqrt(d.loc || 0))) + 8));

    // Color mapper based on risk
    const getRiskColor = (risk) => {
      if (risk === "high") return "hsl(0, 75%, 45%)";
      if (risk === "medium") return "hsl(38, 90%, 48%)";
      return "hsl(140, 70%, 40%)";
    };

    // Draw Links (Lines)
    const link = g.append("g")
      .selectAll("line")
      .data(data.links)
      .enter()
      .append("line")
      .attr("stroke", (l) => l.type === "coupling" ? "#a855f7" : "#1f2a37")
      .attr("stroke-opacity", (l) => l.type === "coupling" ? 0.45 : 0.6)
      .attr("stroke-width", (l) => l.type === "coupling" ? Math.min(6, 1 + l.weight / 2) : 1.5)
      .attr("stroke-dasharray", (l) => l.type === "coupling" ? "4,4" : null)
      .attr("marker-end", (l) => l.type === "coupling" ? null : "url(#arrow)");

    // Draw Nodes (Circles)
    const node = g.append("g")
      .selectAll("g")
      .data(data.nodes)
      .enter()
      .append("g")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))
      .on("mouseover", (event, d) => {
        setHoveredNode(d);

        // Highlight connected components
        const neighbors = new Set([d.id]);
        data.links.forEach((l) => {
          if (l.source.id === d.id) neighbors.add(l.target.id);
          if (l.target.id === d.id) neighbors.add(l.source.id);
        });

        node.attr("opacity", (n) => (neighbors.has(n.id) ? 1.0 : 0.25));
        link
          .attr("stroke", (l) => {
            if (l.source.id === d.id || l.target.id === d.id) {
              return l.type === "coupling" ? "#c084fc" : "#3b82f6";
            }
            return l.type === "coupling" ? "#a855f7" : "#1f2a37";
          })
          .attr("stroke-opacity", (l) =>
            l.source.id === d.id || l.target.id === d.id ? 1.0 : 0.1
          )
          .attr("stroke-width", (l) => {
            if (l.source.id === d.id || l.target.id === d.id) {
              return l.type === "coupling" ? Math.min(8, 2 + l.weight / 2) : 2.5;
            }
            return l.type === "coupling" ? Math.min(6, 1 + l.weight / 2) : 1.5;
          });
      })
      .on("mouseout", () => {
        setHoveredNode(null);
        node.attr("opacity", 1.0);
        link
          .attr("stroke", (l) => l.type === "coupling" ? "#a855f7" : "#1f2a37")
          .attr("stroke-opacity", (l) => l.type === "coupling" ? 0.45 : 0.6)
          .attr("stroke-width", (l) => l.type === "coupling" ? Math.min(6, 1 + l.weight / 2) : 1.5);
      });

    // Outer Glow / Halo for high in-degree core hubs
    node.filter((d) => d.inDegree >= 3)
      .append("circle")
      .attr("r", (d) => Math.max(5, Math.min(22, 5 + Math.sqrt(d.loc || 0))) + 4)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.85);

    // Inner Solid Circle
    node.append("circle")
      .attr("r", (d) => Math.max(5, Math.min(22, 5 + Math.sqrt(d.loc || 0))))
      .attr("fill", (d) => getRiskColor(d.risk_level))
      .attr("stroke", "#090d12")
      .attr("stroke-width", 1.5);

    // Dynamic text labels for key hubs
    node.append("text")
      .attr("dy", ".31em")
      .attr("x", (d) => Math.max(5, Math.min(22, 5 + Math.sqrt(d.loc || 0))) + 5)
      .text((d) => (d.inDegree >= 2 || d.loc > 150 ? d.name : ""))
      .attr("fill", "#94a3b8")
      .style("font-size", "9px")
      .style("font-weight", "500")
      .style("pointer-events", "none");

    // Tick Simulation
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Drag simulation helpers
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data]);

  if (loading) {
    return (
      <div className="graph-loading">
        <div className="shimmer-circle large" />
        <p>Generating architectural dependency graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-error">
        <p>⚠️ {error}</p>
      </div>
    );
  }

  return (
    <div className="dependency-graph-card">
      <div className="graph-header">
        <div className="graph-title-container">
          <h3 className="graph-title">Architectural Dependency Graph</h3>
          <p className="graph-subtitle">
            Visualizing module connections. Dotted rings highlight <strong>hubs</strong> (3+ imports) that represent high risk.
          </p>
        </div>
        <div className="graph-legend-group">
          <span className="graph-legend-item">
            <span className="legend-line import-solid" /> Import
          </span>
          <span className="graph-legend-item">
            <span className="legend-line coupling-dashed" /> Co-Change
          </span>
          <span className="graph-legend-item">
            <span className="legend-dot green" /> Low Risk
          </span>
          <span className="graph-legend-item">
            <span className="legend-dot amber" /> Medium Risk
          </span>
          <span className="graph-legend-item">
            <span className="legend-dot red" /> High Risk
          </span>
        </div>
      </div>

      <div className="graph-viewport-container">
        <svg ref={svgRef} className="dependency-svg" />

        {hoveredNode && (
          <div className="graph-hover-panel">
            <div className="hover-panel-header">
              <span className={`hover-risk-pill ${hoveredNode.risk_level}`}>
                {hoveredNode.risk_level.toUpperCase()} RISK
              </span>
              <span className="hover-panel-loc">{hoveredNode.loc} LOC</span>
            </div>
            <div className="hover-panel-filepath">{hoveredNode.id}</div>
            <div className="hover-panel-stats">
              <div className="stat-col">
                <span className="stat-num">{hoveredNode.debt_score?.toFixed(1)}</span>
                <span className="stat-lbl">Debt Score</span>
              </div>
              <div className="stat-col">
                <span className="stat-num">{hoveredNode.inDegree}</span>
                <span className="stat-lbl">Imported By</span>
              </div>
            </div>
            {/* Git Signals Hover Section */}
            <div className="hover-panel-git-signals">
              <div className="git-signal-row">
                <span className="signal-label">Bug-Fix Ratio</span>
                <span className={`signal-value ${hoveredNode.bug_fix_ratio >= 0.5 ? "danger" : "normal"}`}>
                  {(hoveredNode.bug_fix_ratio * 100).toFixed(0)}%
                  {hoveredNode.bug_fix_ratio >= 0.5 && " ⚠️"}
                </span>
              </div>
              <div className="git-signal-row">
                <span className="signal-label">Bus Factor</span>
                <span className={`signal-value ${hoveredNode.unique_author_count === 1 ? "danger" : "normal"}`}>
                  {hoveredNode.unique_author_count} ({ (hoveredNode.top_author_pct * 100).toFixed(0)}% top)
                  {hoveredNode.unique_author_count === 1 && " 🚨"}
                </span>
              </div>
              <div className="git-signal-row">
                <span className="signal-label">Last Touch</span>
                <span className={`signal-value ${hoveredNode.days_since_last_commit > 180 ? "danger" : "normal"}`}>
                  {hoveredNode.days_since_last_commit}d ago
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
