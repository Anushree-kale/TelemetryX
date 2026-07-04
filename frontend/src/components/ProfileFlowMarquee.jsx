import { motion } from "motion/react";
import GitHubProfileCard from "./GitHubProfileCard";

const CARD_W = 300;
const GAP = 20;

function MarqueeRow({ profiles, direction = 1, speed = 38, onSelect }) {
  const loop = profiles.length * (CARD_W + GAP);
  const items = [...profiles, ...profiles];

  return (
    <div className="profile-marquee__track-wrap">
      <motion.div
        className="profile-marquee__track"
        animate={{ x: direction > 0 ? [0, -loop] : [-loop, 0] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
      >
        {items.map((profile, i) => (
          <div key={`${profile.login}-${i}`} className="profile-marquee__item">
            <GitHubProfileCard profile={profile} onSelect={onSelect} compact />
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export default function ProfileFlowMarquee({ profiles, onSelect }) {
  if (!profiles.length) return null;

  const rowA = profiles;
  const rowB = [...profiles].reverse();

  return (
    <div className="profile-marquee">
      <MarqueeRow profiles={rowA} direction={1} speed={42} onSelect={onSelect} />
      <MarqueeRow profiles={rowB} direction={-1} speed={48} onSelect={onSelect} />
    </div>
  );
}
