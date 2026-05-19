import OrangeCat from "./OrangeCat";
import NavIcon from "./NavIcon";
import { PANELS } from "../labels";

export default function SideNav({
  activePanel,
  onSelect,
  expanded,
  disabled,
  showCat,
}) {
  return (
    <aside
      className={`side-rail ${expanded ? "side-rail--expanded" : "side-rail--collapsed"}`}
      aria-label="Analysis navigation"
    >
      <div className="side-rail-brand" title="TelemetryX">
        <span className="side-rail-logo">TX</span>
      </div>

      {showCat && expanded && (
        <div className="side-rail-cat">
          <OrangeCat variant="sitting" />
        </div>
      )}

      <nav className="side-rail-nav">
        <ul className="side-rail-list">
          {PANELS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`side-rail-btn ${activePanel === p.id ? "active" : ""}`}
                onClick={() => onSelect(p.id)}
                disabled={disabled && p.id !== "overview"}
                title={p.hint}
              >
                <span className="side-rail-icon-wrap">
                  <NavIcon name={p.icon} />
                </span>
                {expanded && (
                  <span className="side-rail-labels">
                    <span className="side-rail-label">{p.label}</span>
                    <span className="side-rail-hint">{p.hint}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {expanded && disabled && (
        <p className="side-rail-foot">Run an analysis to unlock all sections.</p>
      )}
    </aside>
  );
}
