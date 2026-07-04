/** Full-viewport dark canvas — grid only by default; green glow opt-in via showGlow */

export default function InterfaceBackground({ children, className = "", showGlow = false }) {
  return (
    <div className={`interface-bg ${className}`.trim()}>
      <div className="interface-bg__grid" aria-hidden />
      {showGlow && (
        <>
          <div className="interface-bg__glow interface-bg__glow--a" aria-hidden />
          <div className="interface-bg__glow interface-bg__glow--b" aria-hidden />
        </>
      )}
      <div className="interface-bg__content">{children}</div>
    </div>
  );
}
