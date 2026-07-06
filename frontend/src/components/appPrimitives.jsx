import { useEffect, useState } from "react";

/** Compact “what does this mean?” control next to section titles. */
export function SectionHint({ label, children }) {
  return (
    <details className="section-hint-details">
      <summary className="section-hint-summary" title={label || "What does this mean?"}>
        ℹ️
      </summary>
      <div className="section-hint-body">{children}</div>
    </details>
  );
}

export function ProgressBar({ pct, message }) {
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

/** Page-wise section navigator — one page visible at a time with Previous / Next controls. */
export function PanelPager({ pages, resetKey, ariaLabel = "Section pages" }) {
  const [page, setPage] = useState(0);
  const total = pages.length;

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  if (total === 0) return null;

  const atStart = page === 0;
  const atEnd = page === total - 1;

  return (
    <div className="panel-pager" aria-label={ariaLabel}>
      <div className="panel-pager-body">{pages[page]}</div>
      {total > 1 && (
        <footer className="panel-pager-footer">
          <button
            type="button"
            className="panel-pager-btn"
            disabled={atStart}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="panel-pager-indicator">
            Page {page + 1} of {total}
          </span>
          <button
            type="button"
            className="panel-pager-btn panel-pager-btn--next"
            disabled={atEnd}
            onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
          >
            Next
          </button>
        </footer>
      )}
    </div>
  );
}
