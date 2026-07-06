import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelPager } from "./appPrimitives";

const ROWS_PER_PAGE = 18;

export default function CoChangeTab({ jobId, apiBase }) {
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("co_change_count");
  const [sortDir, setSortDir] = useState("desc");

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/jobs/${jobId}/co-changes`);
      if (!res.ok) throw new Error("Failed to load co-change pairs");
      const data = await res.json();
      setPairs(data.pairs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const copy = [...pairs];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string") {
        const c = av.localeCompare(bv);
        return sortDir === "asc" ? c : -c;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [pairs, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "co_change_count" ? "desc" : "asc");
    }
  };

  const indicator = (key) => (key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  if (loading) {
    return (
      <div className="tab-loading card">
        <p>Loading co-change coupling data…</p>
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

  if (pairs.length === 0) {
    return (
      <div className="empty-state card">
        <p>
          No co-change pairs recorded for this scan. Pairs appear when files are edited
          together in the same commit at least three times within the analysis window.
        </p>
      </div>
    );
  }

  const pageCount = Math.ceil(sorted.length / ROWS_PER_PAGE);

  const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
    const slice = sorted.slice(pageIndex * ROWS_PER_PAGE, (pageIndex + 1) * ROWS_PER_PAGE);
    return (
      <div key={pageIndex} className="co-change-tab">
        {pageIndex === 0 && (
          <p className="card-hint co-change-intro">
            Pairs of files edited in the same commit often (change coupling). Think: "if I touch A, I
            probably need to touch B." Same data as dashed purple edges in the dependency map.{" "}
            {sorted.length} pairs total.
          </p>
        )}
        <div className="co-change-table-wrap">
          <table className="co-change-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort("file_a")} className="sortable">
                  File A{indicator("file_a")}
                </th>
                <th onClick={() => toggleSort("file_b")} className="sortable">
                  File B{indicator("file_b")}
                </th>
                <th onClick={() => toggleSort("co_change_count")} className="sortable right">
                  Times changed together{indicator("co_change_count")}
                </th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row, i) => (
                <tr key={`${row.file_a}-${row.file_b}-${i}`}>
                  <td className="cell-path">{row.file_a}</td>
                  <td className="cell-path">{row.file_b}</td>
                  <td className="right strong">{row.co_change_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  });

  return (
    <PanelPager
      pages={pages}
      resetKey={`${jobId}-${sortKey}-${sortDir}`}
      ariaLabel="Co-change analysis pages"
    />
  );
}