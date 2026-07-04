/** Mini contribution heatmap — GitHub profile style */

const LEVELS = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export default function GitHubContributionGraph({ seed = "octocat", weeks = 26, rows = 7 }) {
  const base = hashSeed(seed);

  return (
    <div className="gh-contrib" aria-hidden>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="gh-contrib__row">
          {Array.from({ length: weeks }, (_, col) => {
            const n = (base + row * 17 + col * 31) % 100;
            const level = n < 28 ? 0 : n < 52 ? 1 : n < 72 ? 2 : n < 88 ? 3 : 4;
            return (
              <span
                key={col}
                className="gh-contrib__cell"
                style={{ background: LEVELS[level] }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
