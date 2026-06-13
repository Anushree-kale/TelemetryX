import { useMemo } from "react";
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
 * useScroll → useVelocity → useSpring smooths speed; each card gets a phased
 * rotateX / y wave whose amplitude scales with |velocity|. wrap() loops x offset.
 */
export default function VelocityCardRow({ repos, onSelectRepo }) {
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { stiffness: 400, damping: 90 });

  const loopWidth = repos.length * CARD_STRIDE;
  const items = useMemo(() => [...repos, ...repos, ...repos], [repos]);

  const baseX = useMotionValue(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    baseX.set(wrap(-loopWidth, 0, -latest * 0.42));
  });

  const x = useTransform(baseX, (v) => `${v}px`);
  const velocityFactor = useTransform(smoothVelocity, (v) => Math.min(Math.abs(v) / 500, 1.8));

  return (
    <div
      style={{
        width: "100%",
        overflow: "visible",
        perspective: "1400px",
        perspectiveOrigin: "50% 35%",
      }}
    >
      <motion.div
        style={{
          display: "flex",
          gap: CARD_GAP,
          x,
          transformStyle: "preserve-3d",
          width: "max-content",
          padding: "48px 12vw 64px",
          margin: "0 auto",
          overflow: "visible",
        }}
      >
        {items.map((repo, index) => (
          <VelocityCard
            key={`${repo.name}-${index}`}
            repo={repo}
            cardIndex={index}
            scrollY={scrollY}
            velocityFactor={velocityFactor}
            onSelect={onSelectRepo}
          />
        ))}
      </motion.div>
    </div>
  );
}

/** Per-card wave: phase = index * 0.08, amplitude from velocityFactor × scroll phase. */
function VelocityCard({ repo, cardIndex, scrollY, velocityFactor, onSelect }) {
  const phase = cardIndex * 0.08;

  const rotateX = useTransform([velocityFactor, scrollY], ([factor, scroll]) => {
    const wave = Math.sin(phase + scroll * 0.014);
    return factor * 22 * wave;
  });

  const y = useTransform([velocityFactor, scrollY], ([factor, scroll]) => {
    const wave = Math.sin(phase + scroll * 0.014 + Math.PI / 2);
    return factor * 42 * wave;
  });

  return (
    <motion.div
      style={{
        rotateX,
        y,
        transformStyle: "preserve-3d",
        flexShrink: 0,
        overflow: "visible",
      }}
    >
      <RepoCard repo={repo} onSelect={onSelect} />
    </motion.div>
  );
}
