const ICONS = {
  home: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z" />,
  ticket: (
    <path d="M4 6a2 2 0 012-2h12v4a2 2 0 010 4v4a2 2 0 010 4H6a2 2 0 01-2-2V6zm4 0v12M14 8v1M14 15v1" />
  ),
  chart: (
    <>
      <line x1="5" y1="19" x2="5" y2="9" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="5" strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="19" x2="19" y2="12" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  folder: <path d="M4 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />,
  graph: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 17l8-8M8 17h8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  cluster: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <circle cx="12" cy="16" r="3" />
    </>
  ),
  link: (
    <path d="M10 14a4 4 0 005.66 0l2-2a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-2 2a4 4 0 005.66 5.66l1-1" />
  ),
  "alert-triangle": (
    <path
      d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  heart: (
    <path
      d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  shield: (
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
  ),
};

export default function NavIcon({ name, size = 20 }) {
  const content = ICONS[name];
  if (!content) return null;
  const strokeOnly = name === "chart" || name === "graph";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={strokeOnly ? "none" : "currentColor"}
      stroke={strokeOnly ? "currentColor" : "none"}
      strokeWidth={strokeOnly ? 2 : 0}
      aria-hidden
    >
      {content}
    </svg>
  );
}
