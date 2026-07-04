import { useScrollSectionSpy } from "./useInView";

const NAV_ITEMS = [
  { id: "hero", label: "Index" },
  { id: "capabilities", label: "Capabilities" },
  { id: "features", label: "Signals" },
  { id: "workflow", label: "Workflow" },
  { id: "start", label: "Start" },
];

const SECTION_IDS = NAV_ITEMS.map((n) => n.id);

export default function LandingSideNav() {
  const { active, scrollTo } = useScrollSectionSpy(SECTION_IDS);

  return (
    <nav className="landing-nav" aria-label="Page sections">
      <ul className="landing-nav__list">
        {NAV_ITEMS.map(({ id, label }) => (
          <li key={id}>
            <button
              type="button"
              className={`landing-nav__btn${active === id ? " landing-nav__btn--active" : ""}`}
              onClick={() => scrollTo(id)}
              aria-current={active === id ? "true" : undefined}
            >
              <span className="landing-nav__dot" />
              <span className="landing-nav__label">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
