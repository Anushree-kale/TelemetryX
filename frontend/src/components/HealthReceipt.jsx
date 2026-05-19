import { useState } from "react";
import { buildHealthSummary } from "../friendlyLabels";

export default function HealthReceipt({ modules, repoUrl }) {
  const [printing, setPrinting] = useState(false);
  const [visible, setVisible] = useState(false);
  const text = buildHealthSummary(modules, repoUrl);

  const handlePrint = () => {
    if (!text) return;
    setVisible(false);
    setPrinting(true);
    window.setTimeout(() => {
      setVisible(true);
      setPrinting(false);
    }, 600);
  };

  const handleCopy = () => {
    if (text) navigator.clipboard.writeText(text);
  };

  return (
    <section className="receipt-section" aria-label="Generate health report">
      <div className="receipt-printer">
        <button
          type="button"
          className={`btn-receipt ${printing ? "printing" : ""}`}
          onClick={handlePrint}
          disabled={!modules?.length}
        >
          <span className="btn-receipt-icon" aria-hidden>
            🖨️
          </span>
          Print repo health report
        </button>
        <div className={`receipt-slot ${visible ? "has-paper" : ""}`}>
          <div className={`receipt-paper ${printing ? "feeding" : visible ? "out" : ""}`}>
            {visible && text && (
              <>
                <pre className="receipt-text">{text}</pre>
                <button type="button" className="btn-receipt-copy" onClick={handleCopy}>
                  Copy receipt
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="receipt-hint">
        One-page plain-English summary — like a coffee-shop receipt for your codebase.
      </p>
    </section>
  );
}
