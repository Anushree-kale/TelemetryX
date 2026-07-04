import { useMemo } from "react";
import { getUser } from "../auth";
import ProfileFlowMarquee from "./ProfileFlowMarquee";

const CURATED = [
  { login: "octocat", name: "The Octocat", avatar: "https://github.com/octocat.png" },
  { login: "vercel", name: "Vercel", avatar: "https://github.com/vercel.png" },
  { login: "facebook", name: "Meta Open Source", avatar: "https://github.com/facebook.png" },
  { login: "torvalds", name: "Linus Torvalds", avatar: "https://github.com/torvalds.png" },
  { login: "Anushree-kale", name: "Anushree Kale", avatar: "https://github.com/Anushree-kale.png" },
  { login: "huggingface", name: "Hugging Face", avatar: "https://github.com/huggingface.png" },
];

function ownerFromUrl(url) {
  const m = String(url || "").match(/github\.com[/:]([^/]+)/i);
  return m?.[1] || null;
}

function buildProfiles(user, repoList) {
  const byLogin = new Map();

  const add = (login, extra = {}) => {
    if (!login) return;
    const key = login.toLowerCase();
    const existing = byLogin.get(key) || {
      login,
      name: login,
      avatar: `https://github.com/${login}.png?size=120`,
      repos: [],
    };
    byLogin.set(key, { ...existing, ...extra, repos: [...new Set([...existing.repos, ...(extra.repos || [])])] });
  };

  if (user?.login) {
    add(user.login, {
      name: user.name || user.login,
      avatar: user.avatar_url || `https://github.com/${user.login}.png?size=120`,
    });
  }

  for (const url of repoList || []) {
    const owner = ownerFromUrl(url);
    if (!owner) continue;
    const repo = url.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "");
    add(owner, { repos: [repo] });
  }

  for (const c of CURATED) {
    add(c.login, c);
  }

  const list = [...byLogin.values()];
  if (user?.login) {
    list.sort((a, b) => (a.login === user.login ? -1 : b.login === user.login ? 1 : 0));
  }
  return list;
}

export default function RecentProfilesPicker({ repoList, onRepoSelect }) {
  const user = getUser();
  const userLogin = user?.login;
  const profiles = useMemo(
    () => buildProfiles(getUser(), repoList),
    [repoList, userLogin],
  );

  const handleProfileSelect = (profile) => {
    const repo = profile.repos[0] || `${profile.login}/${profile.login}`;
    onRepoSelect?.(repo.includes("/") ? repo : `${profile.login}/${repo}`);
  };

  return (
    <section className="recent-profiles" aria-label="GitHub profiles">
      <header className="recent-profiles__header">
        <p className="recent-profiles__eyebrow">// repository intelligence</p>
        <h2 className="recent-profiles__title">
          <span className="recent-profiles__title-line">Who&apos;s</span>
          <span className="recent-profiles__title-line recent-profiles__title-line--accent">shipping?</span>
        </h2>
        <p className="recent-profiles__sub">
          Flow through GitHub profiles — pick one to scan their repositories for debt, risk, and remediation.
        </p>
        {user?.login && (
          <p className="recent-profiles__signed-in">
            Signed in as <strong>@{user.login}</strong>
          </p>
        )}
      </header>

      <ProfileFlowMarquee profiles={profiles} onSelect={handleProfileSelect} />

      <p className="recent-profiles__hint">
        Scroll down to paste any repo URL, or tap a profile card above
      </p>
    </section>
  );
}
