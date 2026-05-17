export default function ProgressBar({ pct, message }) {
  const safePct = Math.min(100, Math.max(0, pct ?? 0));
  return (
    <div className="progress-wrap">
      <div className="progress-meta">
        <span>{message || "Working…"}</span>
        <span>{safePct}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${safePct}%` }} />
      </div>
    </div>
  );
}
