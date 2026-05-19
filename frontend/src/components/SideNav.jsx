import { PANELS } from "../friendlyLabels";

export default function SideNav({ activePanel, onSelect, hasData, disabled }) {
  return (
    <nav className="side-nav" aria-label="Report sections">
      <p className="side-nav-heading">Your repo</p>
      <ul className="side-nav-list">
        {PANELS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`side-nav-btn ${activePanel === p.id ? "active" : ""}`}
              onClick={() => onSelect(p.id)}
              disabled={disabled && p.id !== "overview"}
              title={p.hint}
            >
              <span className="side-nav-icon" aria-hidden>
                {p.icon}
              </span>
              <span className="side-nav-text">
                <span className="side-nav-label">{p.label}</span>
                <span className="side-nav-hint">{p.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!hasData && (
        <p className="side-nav-foot">Scan a repo first — panels unlock after analysis.</p>
      )}
    </nav>
  );
}
