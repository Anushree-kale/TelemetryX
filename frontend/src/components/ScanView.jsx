import { useEffect, useState } from "react";

const PHASES = [
  "Cloning repository",
  "Building AST + call graph",
  "Causal commit analysis (SZZ)",
  "Scoring failure risk (LSTM)",
  "Ranking remediation targets",
];

const SWEEP_BAR_COUNT = 28;

export default function ScanView({ progressPct = 0, progressMessage = "" }) {
  const [timedPhase, setTimedPhase] = useState(0);

  useEffect(() => {
    const fromPct = Math.min(
      PHASES.length - 1,
      Math.floor((progressPct / 100) * PHASES.length),
    );
    setTimedPhase(fromPct);
  }, [progressPct]);

  useEffect(() => {
    if (progressPct > 0) return undefined;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i < PHASES.length) setTimedPhase(i);
    }, 550);
    return () => window.clearInterval(id);
  }, [progressPct]);

  const activePhase = progressPct > 0
    ? Math.min(PHASES.length - 1, Math.floor((progressPct / 100) * PHASES.length))
    : timedPhase;

  return (
    <div className="tx-view tx-view--scan">
      <div className="tx-eyebrow">// SCANNING</div>

      <div className="tx-sweep-wrap">
        <div className="tx-sweep-bars" aria-hidden>
          {Array.from({ length: SWEEP_BAR_COUNT }, (_, i) => (
            <i key={i} style={{ animationDelay: `${i * 0.045}s` }} />
          ))}
        </div>
        <div className="tx-sweep-line" aria-hidden />
      </div>

      <div className="tx-phase-list">
        {PHASES.map((label, i) => {
          let state = "";
          if (i < activePhase) state = "done";
          else if (i === activePhase) state = "active";
          return (
            <div key={label} className={`tx-phase ${state}`}>
              <span className="tx-brk">›</span>
              {label}
            </div>
          );
        })}
      </div>

      {progressMessage && (
        <p className="tx-scan-message">{progressMessage}</p>
      )}
    </div>
  );
}
