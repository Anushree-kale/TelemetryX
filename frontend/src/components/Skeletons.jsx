export function SummaryCardsSkeleton() {
  return (
    <div className="summary-grid">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="summary-card" style={{ minHeight: "100px" }}>
          <span className="skeleton skeleton-text" />
          <span className="skeleton skeleton-title" style={{ marginTop: "0.5rem" }} />
          <span className="skeleton skeleton-sub" style={{ marginTop: "0.5rem" }} />
        </div>
      ))}
    </div>
  );
}

export function ModulesTableSkeleton() {
  return (
    <div className="card">
      <div className="skeleton" style={{ height: "1.25rem", width: "150px", marginBottom: "1.5rem" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #2a3548", paddingBottom: "0.75rem" }}>
          <div className="skeleton" style={{ height: "1rem", width: "30%" }} />
          <div className="skeleton" style={{ height: "1rem", width: "12%" }} />
          <div className="skeleton" style={{ height: "1rem", width: "12%" }} />
          <div className="skeleton" style={{ height: "1rem", width: "12%" }} />
          <div className="skeleton" style={{ height: "1rem", width: "12%" }} />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e2a3a", paddingBottom: "0.5rem" }}>
            <div className="skeleton" style={{ height: "1rem", width: "40%" }} />
            <div className="skeleton" style={{ height: "1rem", width: "10%" }} />
            <div className="skeleton" style={{ height: "1rem", width: "10%" }} />
            <div className="skeleton" style={{ height: "1rem", width: "10%" }} />
            <div className="skeleton" style={{ height: "1rem", width: "10%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
