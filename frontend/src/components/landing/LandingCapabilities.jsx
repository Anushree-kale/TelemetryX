import { useState } from "react";
import useInView from "./useInView";
import { PANELS } from "../../labels";

const SPANS = ["", "", " landing-cap-card--tall", "", " landing-cap-card--wide", ""];

export default function LandingCapabilities() {
  const [headerRef, headerVisible] = useInView({ threshold: 0.2 });
  const [gridRef, gridVisible] = useInView({ threshold: 0.1 });

  return (
    <section id="capabilities" className="landing-section landing-capabilities">
      <div
        ref={headerRef}
        className={`landing-capabilities__header landing-reveal landing-reveal--left${headerVisible ? " landing-reveal--visible" : ""}`}
      >
        <div>
          <span className="landing-section__eyebrow">01 / Capabilities</span>
          <h2 className="landing-section__title">DASHBOARD MODULES</h2>
        </div>
        <p className="landing-section__desc">
          Eight focused views — from executive overview to co-change coupling and dependency graphs.
        </p>
      </div>

      <div
        ref={gridRef}
        className={`landing-cap-grid landing-reveal${gridVisible ? " landing-reveal--visible" : ""}`}
      >
        {PANELS.map((panel, index) => (
          <CapabilityCard key={panel.id} panel={panel} index={index} span={SPANS[index % SPANS.length]} />
        ))}
      </div>
    </section>
  );
}

function CapabilityCard({ panel, index, span }) {
  const [hovered, setHovered] = useState(false);
  const [ref, visible] = useInView({ threshold: 0.15 });
  const active = hovered || (index === 0 && visible);

  return (
    <article
      ref={ref}
      className={`landing-cap-card${span}${active ? " landing-cap-card--active" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div className="landing-cap-card__bg" aria-hidden />
      <div>
        <span className="landing-cap-card__medium">{panel.hint}</span>
        <h3 className="landing-cap-card__title">{panel.label}</h3>
      </div>
      <p className="landing-cap-card__desc">{panel.hint}</p>
      <span className="landing-cap-card__index">{String(index + 1).padStart(2, "0")}</span>
      <div className="landing-cap-card__corner" aria-hidden>
        <div className="landing-cap-card__corner-h" />
        <div className="landing-cap-card__corner-v" />
      </div>
    </article>
  );
}
