import { Link } from "react-router-dom";
import BrandTitle from "../components/BrandTitle";
import InterfaceBackground from "../components/InterfaceBackground";
import ProfileFlowMarquee from "../components/ProfileFlowMarquee";
import { APP_TAGLINE } from "../labels";

const PREVIEW_PROFILES = [
  { login: "octocat", name: "The Octocat", avatar: "https://github.com/octocat.png", repos: ["octocat/Hello-World"] },
  { login: "vercel", name: "Vercel", avatar: "https://github.com/vercel.png", repos: ["vercel/next.js"] },
  { login: "facebook", name: "Meta Open Source", avatar: "https://github.com/facebook.png", repos: ["facebook/react"] },
  { login: "torvalds", name: "Linus Torvalds", avatar: "https://github.com/torvalds.png", repos: ["torvalds/linux"] },
  { login: "huggingface", name: "Hugging Face", avatar: "https://github.com/huggingface.png", repos: ["huggingface/transformers"] },
];

export default function HomePage() {
  return (
    <InterfaceBackground className="landing-page">
      <div className="landing-hero">
        <div className="landing-hero__title">
          <BrandTitle size="lg" />
        </div>
        <div className="landing-hero__body">
          <p className="landing-tagline">{APP_TAGLINE}</p>
          <div className="landing-actions">
            <Link to="/login" className="landing-cta">
              Sign in with GitHub
            </Link>
            <Link to="/signup" className="landing-cta landing-cta--ghost">
              Create account
            </Link>
          </div>
        </div>
        <div className="landing-hero__marquee" aria-hidden>
          <ProfileFlowMarquee profiles={PREVIEW_PROFILES} />
        </div>
      </div>
    </InterfaceBackground>
  );
}
