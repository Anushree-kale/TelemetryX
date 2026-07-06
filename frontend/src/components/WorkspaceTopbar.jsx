import { PANELS } from "../labels";

const NAV_GROUPS = [
  { label: "INTELLIGENCE", panels: ["overview", "failure"] },
  { label: "CODE QUALITY", panels: ["fixes", "charts", "files"] },
  { label: "STRUCTURE", panels: ["graph", "clusters", "cochange"] },
];

function statusLabel(phase, status) {
  if (phase === "scanning" || status === "pending" || status === "running") return "scanning";
  if (phase === "results" || status === "complete") return "complete";
  return "idle";
}

export default function WorkspaceTopbar({
  activePanel,
  onSelect,
  disabled,
  uiPhase,
  status,
}) {
  const pillOn = uiPhase === "scanning" || uiPhase === "results";
  const pillText = statusLabel(uiPhase, status);

  return (
    <header className="tx-topbar">
      <div className="tx-brand">
        TX<span className="tx-brand-dot">.</span>
      </div>

      <nav className="tx-tabgroups" aria-label="Analysis panels">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="tx-tabgroup">
            <div className="tx-tabgroup-label">{group.label}</div>
            <div className="tx-tabrow">
              {group.panels.map((panelId) => {
                const p = PANELS.find((item) => item.id === panelId);
                if (!p) return null;
                const isDisabled = disabled && p.id !== "overview";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`tx-tab ${activePanel === p.id ? "active" : ""}`}
                    onClick={() => onSelect(p.id)}
                    disabled={isDisabled}
                    title={p.hint}
                  >
                    <span className="tx-brk">[</span>
                    {p.label}
                    <span className="tx-brk">]</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`tx-status-pill ${pillOn ? "on" : ""}`}>
        <i className="tx-led" aria-hidden />
        <span>{pillText}</span>
      </div>
    </header>
  );
}
