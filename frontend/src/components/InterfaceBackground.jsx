/** Full-viewport black canvas with subtle grid + green glow — INTERFACE-inspired */

export default function InterfaceBackground({ children, className = "" }) {
  return (
    <div className={`interface-bg ${className}`.trim()}>
      <div className="interface-bg__grid" aria-hidden />
      <div className="interface-bg__glow interface-bg__glow--a" aria-hidden />
      <div className="interface-bg__glow interface-bg__glow--b" aria-hidden />
      <div className="interface-bg__content">{children}</div>
    </div>
  );
}
