import { Link } from "react-router-dom";
import BrandTitle from "../components/BrandTitle";
import AnimatedCatBackground from "../components/AnimatedCatBackground";
import { APP_TAGLINE } from "../labels";

export default function HomePage() {
  return (
    <div className="landing-page">
      <AnimatedCatBackground />
      <div className="landing-hero">
        <BrandTitle size="lg" />
        <p className="landing-tagline">{APP_TAGLINE}</p>
        <Link to="/login" className="landing-cta">
          Sign in
        </Link>
        <Link to="/signup" className="landing-cta landing-cta--ghost">
          Create account
        </Link>
      </div>
    </div>
  );
}
