import { Link } from "react-router-dom";
import BrandTitle from "../components/BrandTitle";
import VideoBackground from "../components/VideoBackground";
import { APP_TAGLINE } from "../labels";

export default function HomePage() {
  return (
    <div className="landing-page">
      <VideoBackground variant="home" />
      <div className="landing-hero">
        <div className="landing-hero__title">
          <BrandTitle size="lg" />
        </div>
        <div className="landing-hero__body">
          <p className="landing-tagline">{APP_TAGLINE}</p>
          <Link to="/login" className="landing-cta">
            Sign in
          </Link>
          <Link to="/signup" className="landing-cta landing-cta--ghost">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
