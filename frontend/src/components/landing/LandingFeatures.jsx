import { useRef, useState, useEffect } from "react";
import useInView from "./useInView";

const FEATURES = [
  {
    tag: "Scoring",
    title: "Technical Debt",
    desc: "0–100 model scores rank rework risk, complexity, and change difficulty across every module.",
  },
  {
    tag: "Explain",
    title: "Risk Drivers",
    desc: "Code-grounded SHAP explanations show why each file scored high — pointing at real functions and metrics.",
  },
  {
    tag: "Output",
    title: "Remediation",
    desc: "Jira-ready work items with priority scores, effort estimates, and plain-English rationale.",
  },
  {
    tag: "Trends",
    title: "Scan History",
    desc: "Track debt score and high-risk module counts across repeated scans of the same repository.",
  },
  {
    tag: "Graph",
    title: "Dependencies",
    desc: "Interactive import graphs reveal blast radius, centrality, and coupling hotspots.",
  },
];

export default function LandingFeatures() {
  const sectionRef = useRef(null);
  const cursorRef = useRef(null);
  const [hovering, setHovering] = useState(false);
  const [headerRef, headerVisible] = useInView({ threshold: 0.2 });

  useEffect(() => {
    const section = sectionRef.current;
    const cursor = cursorRef.current;
    if (!section || !cursor) return undefined;

    const onMove = (e) => {
      const rect = section.getBoundingClientRect();
      cursor.style.left = `${e.clientX - rect.left}px`;
      cursor.style.top = `${e.clientY - rect.top}px`;
    };

    section.addEventListener("mousemove", onMove);
    return () => section.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <section
      ref={sectionRef}
      id="features"
      className={`landing-section landing-features${hovering ? " landing-features--hover" : ""}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div ref={cursorRef} className="landing-features__cursor" aria-hidden />

      <div
        ref={headerRef}
        className={`landing-features__header landing-reveal landing-reveal--left${headerVisible ? " landing-reveal--visible" : ""}`}
      >
        <span className="landing-section__eyebrow">02 / Signals</span>
        <h2 className="landing-section__title">WHAT WE MEASURE</h2>
      </div>

      <div className="landing-features__track">
        {FEATURES.map((feature, index) => (
          <FeatureCard key={feature.title} feature={feature} index={index} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }) {
  const [ref, visible] = useInView({ threshold: 0.1 });

  return (
    <article
      ref={ref}
      className={`landing-feature-card landing-reveal${visible ? " landing-reveal--visible" : ""}`}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      <div className="landing-feature-card__inner">
        <div className="landing-feature-card__meta">
          <span className="landing-feature-card__num">No. {String(index + 1).padStart(2, "0")}</span>
          <span className="landing-feature-card__tag">{feature.tag}</span>
        </div>
        <h3 className="landing-feature-card__title">{feature.title}</h3>
        <div className="landing-feature-card__line" />
        <p className="landing-feature-card__desc">{feature.desc}</p>
      </div>
      <div className="landing-feature-card__shadow" aria-hidden />
    </article>
  );
}
