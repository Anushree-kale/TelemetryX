/** Compact “what does this mean?” control next to section titles. */
export default function SectionHint({ label, children }) {
  return (
    <details className="section-hint-details">
      <summary className="section-hint-summary" title={label || "What does this mean?"}>
        ℹ️
      </summary>
      <div className="section-hint-body">{children}</div>
    </details>
  );
}
