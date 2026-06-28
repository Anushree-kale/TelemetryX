/** High-contrast editorial wordmark (Bodoni Moda) */

export default function BrandTitle({ className = "", size = "lg" }) {
  return (
    <h1 className={`brand-title brand-title--${size} ${className}`.trim()}>
      <span className="brand-title__word">Telemetry</span>
      <span className="brand-title__x"> x</span>
    </h1>
  );
}
