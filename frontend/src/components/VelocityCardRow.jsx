import { useMemo, useRef } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from "motion/react";
import RepoCard from "./RepoCard";

const CARD_WIDTH = 280;
const CARD_GAP = 20;
const CARD_STRIDE = CARD_WIDTH + CARD_GAP;

/**
 * Horizontal 3D card strip driven by scroll velocity.
 * useScroll + useVelocity → useSpring smooths velocity → per-card useTransform
 * applies a phased rotateX / y wave. wrap() + scroll-synced x offset loops the row.
 */
export default function VelocityCardRow({ repos, onSelectRepo }) {
  const containerRef = useRef(null);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { stiffness: 400, damping: 90 });

  const loopWidth = repos.length * CARD_STRIDE;
  const items = useMemo(() => [...repos, ...repos, ...repos], [repos]);

  const baseX = useMotionValue(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    baseX.set(wrap(-loopWidth, 0, -latest * 0.35));
  });

  const x = useTransform(baseX, (v) => `${v}px`);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        overflow: "hidden",
        perspective: "1200px",
        perspectiveOrigin: "50% 40%",
      }}
    >
      <motion.div
        style={{
          display: "flex",
          gap: CARD_GAP,
          x,
          transformStyle: "preserve-3d",
          width: "max-content",
          padding: "32px 0 48px",
          margin: "0 auto",
        }}
      >
        {items.map((repo, index) => (
          <VelocityCard
            key={`${repo.name}-${index}`}
            repo={repo}
            index={index}
            smoothVelocity={smoothVelocity}
            onSelect={onSelectRepo}
          />
        ))}
      </motion.div>
    </div>
  );
}

/** Applies velocity-linked wave offset per card (index * 0.08 phase). */
function VelocityCard({ repo, index, smoothVelocity, onSelect }) {
  const phase = index * 0.08;

  const rotateX = useTransform(smoothVelocity, (v) => {
    const intensity = Math.min(Math.abs(v) / 1200, 1);
    const direction = v >= 0 ? 1 : -1;
    return direction * intensity * 16 * Math.sin(phase + v * 0.0006);
  });

  const y = useTransform(smoothVelocity, (v) => {
    const intensity = Math.min(Math.abs(v) / 900, 1);
    return intensity * 28 * Math.sin(phase + v * 0.0009);
  });

  return (
    <motion.div
      style={{
        rotateX,
        y,
        transformStyle: "preserve-3d",
        flexShrink: 0,
      }}
    >
      <RepoCard repo={repo} onSelect={onSelect} />
    </motion.div>
  );
}
