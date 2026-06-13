import { useEffect, useState } from "react";

/**
 * Page-wise section navigator — one page visible at a time with Previous / Next controls.
 */
export default function PanelPager({ pages, resetKey, ariaLabel = "Section pages" }) {
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