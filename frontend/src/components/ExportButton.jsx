import React, { useState } from 'react';

export default function ExportButton({ jobId, apiBase }) {
  const [format, setFormat] = useState('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const download = async (fmt) => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/jobs/${jobId}/export?format=${fmt}&limit=5000`);
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || 'Export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = fmt === 'pdf' ? 'pdf' : 'csv';
      a.download = `job_${jobId}_export.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="export-button-wrapper" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button
        type="button"
        className="export-btn"
        onClick={() => download(format)}
        disabled={loading || !jobId}
        style={{
          background: 'var(--accent, #e07a4a)',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          padding: '6px 12px',
          cursor: loading || !jobId ? 'not-allowed' : 'pointer',
          opacity: loading || !jobId ? 0.65 : 1,
          transition: 'background 0.2s, transform 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!loading && jobId) e.currentTarget.style.background = 'var(--accent-hover, #c45c32)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--accent, #e07a4a)';
        }}
      >
        {loading ? 'Exporting…' : 'Export'}
      </button>
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        disabled={loading || !jobId}
        aria-label="Export format"
        style={{
          borderRadius: '4px',
          border: '1px solid var(--border, #e5e0d8)',
          padding: '4px 6px',
        }}
      >
        <option value="csv">CSV</option>
        <option value="pdf">PDF</option>
      </select>
      {error && (
        <span style={{ color: 'var(--danger, #c94a4a)', fontSize: '0.8rem' }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
