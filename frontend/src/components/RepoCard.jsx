import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const ACCENT = "#7c3aed";
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%";

function ogImageUrl(repoName) {
  const [owner, repo] = repoName.split("/");
  return `https://opengraph.githubassets.com/1/${owner}/${repo}`;
}

/** Scrambled character reveal for the hover label (Motion+ ScrambleText substitute). */
function ScrambleLabel({ text, active }) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!active) {
      setDisplay(text);
      return undefined;
    }

    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      if (frame >= 14) {
        setDisplay(text);
        clearInterval(id);
        return;
      }
      setDisplay(
        text
          .split("")
          .map((ch, i) =>
            ch === " "
              ? " "
              : i < frame
                ? text[i]
                : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
          )
          .join(""),
      );
    }, 45);

    return () => clearInterval(id);
  }, [active, text]);

  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      style={{
        fontFamily: "ui-monospace, 'Cascadia Code', monospace",
        fontSize: "0.85rem",
        fontWeight: 700,
        letterSpacing: "0.22em",
        color: "#fff",
      }}
    >
      {display}
    </motion.span>
  );
}

/**
 * Single repository card: OG cover, debt badge, hover z-lift with scrambled SELECT label.
 * Click invokes onSelect with the full repo name (owner/repo).
 */
export default function RepoCard({ repo, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const shortName = repo.name.split("/").pop() || repo.name;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(repo.name)}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      animate={{
        scale: hovered ? 1.04 : 1,
        z: hovered ? 48 : 0,
      }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      style={{
        position: "relative",
        flexShrink: 0,
        width: 280,
        height: 180,
        borderRadius: 12,
        border: hovered ? `2px solid ${ACCENT}` : "2px solid transparent",
        background: "#141414",
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        transformStyle: "preserve-3d",
        textAlign: "left",
        boxShadow: hovered
          ? `0 24px 48px rgba(124, 58, 237, 0.28), 0 8px 24px rgba(0,0,0,0.45)`
          : "0 8px 24px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${ogImageUrl(repo.name)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)",
        }}
      />

      <span
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: "0.72rem",
          fontWeight: 600,
          color: "#fff",
          background: ACCENT,
          boxShadow: "0 2px 8px rgba(124, 58, 237, 0.45)",
        }}
      >
        Debt: {repo.debtScore}%
      </span>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "12px 14px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.82rem",
            fontWeight: 600,
            color: "#f5f5f5",
            fontFamily: "Inter, system-ui, sans-serif",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={repo.name}
        >
          {shortName}
        </p>
        <p
          style={{
            margin: "2px 0 0",
            fontSize: "0.68rem",
            color: "rgba(255,255,255,0.55)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {repo.name}
        </p>
      </div>

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(10, 10, 10, 0.55)",
              backdropFilter: "blur(2px)",
            }}
          >
            <ScrambleLabel text="SELECT" active={hovered} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
