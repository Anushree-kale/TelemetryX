import { Link } from "react-router-dom";
import useInView from "./useInView";

export default function LandingCta() {
  const [headerRef, headerVisible] = useInView({ threshold: 0.2 });
  const [bannerRef, bannerVisible] = useInView({ threshold: 0.2 });

  return (
    <section id="start" className="landing-section landing-cta">
      <div
        ref={headerRef}
        className={`landing-cta__header landing-reveal landing-reveal--left${headerVisible ? " landing-reveal--visible" : ""}`}
      >
        <span className="landing-section__eyebrow">04 / Start</span>
        <h2 className="landing-section__title">GET STARTED</h2>
      </div>

      <div className="landing-cta__grid">
        <div className="landing-cta__col">
          <h4>Stack</h4>
          <ul>
            <li>React + Vite</li>
            <li>Python / FastAPI</li>
            <li>PyTorch LSTM</li>
          </ul>
        </div>
        <div className="landing-cta__col">
          <h4>Analysis</h4>
          <ul>
            <li>Debt scoring</li>
            <li>Failure prediction</li>
            <li>Co-change graphs</li>
          </ul>
        </div>
        <div className="landing-cta__col">
          <h4>Output</h4>
          <ul>
            <li>Jira remediation</li>
            <li>CSV export</li>
            <li>Compare repos</li>
          </ul>
        </div>
        <div className="landing-cta__col">
          <h4>Account</h4>
          <ul>
            <li>
              <Link to="/login">Sign in</Link>
            </li>
            <li>
              <Link to="/signup">Create account</Link>
            </li>
          </ul>
        </div>
      </div>

      <div
        ref={bannerRef}
        className={`landing-cta__banner landing-reveal${bannerVisible ? " landing-reveal--visible" : ""}`}
      >
        <div className="landing-cta__banner-text">
          <h3>Ready to scan your codebase?</h3>
          <p>Connect GitHub, pick a repository, and get actionable intelligence in minutes.</p>
        </div>
        <div className="landing-cta__banner-actions">
          <Link to="/login" className="landing-cta__btn landing-cta__btn--primary">
            Sign in with GitHub
          </Link>
          <Link to="/signup" className="landing-cta__btn landing-cta__btn--ghost">
            Create account
          </Link>
        </div>
      </div>

      <div className="landing-cta__foot">
        <p>© {new Date().getFullYear()} TelemetryX</p>
        <p>Repository intelligence for engineering teams</p>
      </div>
    </section>
  );
}
