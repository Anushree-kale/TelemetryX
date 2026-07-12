import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import AnimatedNoise from "./AnimatedNoise";
import ScrambleText from "./ScrambleText";
import { APP_TAGLINE } from "../../labels";

export default function LandingHero() {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.75], [0, -80]);
  const yImage = useTransform(scrollYProgress, [0, 0.75], [0, -120]);

  return (
    <section ref={sectionRef} id="hero" className="landing-hero">
      <AnimatedNoise />
      <span className="landing-hero__rail-label">TelemetryX</span>

      <div className="landing-hero__container">
        <motion.div style={{ opacity, y }} className="landing-hero__content">
          <h1 className="landing-hero__title">TELEMETRY X</h1>
          <p className="landing-hero__subtitle">Repository Intelligence Platform</p>
          <p className="landing-hero__tagline">{APP_TAGLINE}</p>

          <div className="landing-hero__actions">
            <Link to="/login" className="landing-hero__cta">
              <ScrambleText text="Sign in with GitHub" />
              <span className="landing-hero__cta-arrow" aria-hidden>
                →
              </span>
            </Link>
            <a href="#capabilities" className="landing-hero__link">
              Explore capabilities
            </a>
          </div>
        </motion.div>

        <motion.div style={{ opacity, y: yImage }} className="landing-hero__visual">
          <img
            src="/hero-illustration.png"
            alt="TelemetryX data visualization"
            className="landing-hero__image"
          />
        </motion.div>
      </div>

      <div className="landing-hero__badge">v0.1 / Debt &amp; Risk Analytics</div>
    </section>
  );
}
