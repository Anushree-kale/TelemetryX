import { useState } from "react";
import { motion } from "motion/react";
import GitHubContributionGraph from "./GitHubContributionGraph";

function RepoSnippet({ name }) {
  const short = name?.split("/").pop() || name;
  return (
    <div className="gh-profile-card__repo">
      <span className="gh-profile-card__repo-icon" aria-hidden>
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path
            fill="currentColor"
            d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-.75.75h-8.75A2.5 2.5 0 0 1 2 2.5Zm10.75.75V2.5a1 1 0 0 0-1-1h-8.75a1 1 0 0 0-1 1v.75a1 1 0 0 0 1 1h8.75a1 1 0 0 0 1-1Z"
          />
        </svg>
      </span>
      <span className="gh-profile-card__repo-name">{short}</span>
      <span className="gh-profile-card__repo-vis">Public</span>
    </div>
  );
}

export default function GitHubProfileCard({ profile, onSelect, compact = false }) {
  const [hovered, setHovered] = useState(false);
  const { login, name, avatar, repos = [] } = profile;
  const featuredRepo = repos[0] || `${login}/${login}`;

  return (
    <motion.button
      type="button"
      className={`gh-profile-card${compact ? " gh-profile-card--compact" : ""}`}
      onClick={() => onSelect?.(profile)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      <div className="gh-profile-card__header">
        <img
          className="gh-profile-card__avatar"
          src={avatar || `https://github.com/${login}.png?size=80`}
          alt=""
          loading="lazy"
        />
        <div className="gh-profile-card__meta">
          <span className="gh-profile-card__name">{name || login}</span>
          <span className="gh-profile-card__login">@{login}</span>
        </div>
      </div>

      <div className="gh-profile-card__contrib-wrap">
        <span className="gh-profile-card__contrib-label">
          {repos.length} repo{repos.length === 1 ? "" : "s"} tracked
        </span>
        <GitHubContributionGraph seed={login} weeks={compact ? 18 : 22} />
      </div>

      <RepoSnippet name={featuredRepo} />

      <motion.span
        className="gh-profile-card__cta"
        animate={{ opacity: hovered ? 1 : 0, y: hovered ? 0 : 4 }}
        transition={{ duration: 0.18 }}
      >
        Open workspace →
      </motion.span>
    </motion.button>
  );
}
