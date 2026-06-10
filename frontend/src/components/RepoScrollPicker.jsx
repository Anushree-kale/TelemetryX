import { useEffect, useState } from "react";
import VelocityCardRow from "./VelocityCardRow";
import RepoCard from "./RepoCard";

const RECENT_REPOS = [
  { name: "Anushree-kale/TelemetryX", debtScore: 72 },
  { name: "Anushree-kale/Fraudchills", debtScore: 45 },
  { name: "Anushree-kale/DigitBoard", debtScore: 31 },
  { name: "facebook/react", debtScore: 18 },
  { name: "vercel/next.js", debtScore: 55 },
  { name: "huggingface/transformers", debtScore: 63 },
];

const MOBILE_BREAKPOINT = 768;

/**
 * Full-viewport repo picker section. Desktop shows the velocity-linked 3D card row;
 * mobile falls back to a simple vertical list. Selection is passed up via onRepoSelect.
 */
export default function RepoScrollPicker({ onRepoSelect, repos = RECENT_REPOS }) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const handleSelect = (repoName) => {
    onRepoSelect?.(repoName);
  };

  return (
    <section
      aria-label="Recent repositories"
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 1.5rem 3rem",
        margin: "0 -2rem 2rem",
        boxSizing: "border-box",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: isMobile ? "2rem" : "2.5rem" }}>
        <h2
          style={{
            margin: 0,
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            fontWeight: 500,
            color: "#ffffff",
            fontFamily: "ui-serif, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
            letterSpacing: "-0.02em",
          }}
        >
          Recent Repositories
        </h2>
        <p
          style={{
            margin: "0.65rem 0 0",
            fontSize: "0.95rem",
            color: "rgba(255,255,255,0.45)",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          Pick up where you left off
        </p>
      </header>

      {isMobile ? (
        <div
          style={{
            width: "100%",
            maxWidth: 320,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxHeight: "55vh",
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {repos.map((repo) => (
            <div key={repo.name} style={{ display: "flex", justifyContent: "center" }}>
              <RepoCard repo={repo} onSelect={handleSelect} />
            </div>
          ))}
        </div>
      ) : (
        <VelocityCardRow repos={repos} onSelectRepo={handleSelect} />
      )}
    </section>
  );
}
