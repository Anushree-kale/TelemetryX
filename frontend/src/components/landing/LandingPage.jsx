import LandingSideNav from "./LandingSideNav";
import LandingHero from "./LandingHero";
import LandingCapabilities from "./LandingCapabilities";
import LandingFeatures from "./LandingFeatures";
import LandingWorkflow from "./LandingWorkflow";
import LandingCta from "./LandingCta";

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="landing__grid" aria-hidden />
      <LandingSideNav />
      <div className="landing__content">
        <LandingHero />
        <LandingCapabilities />
        <LandingFeatures />
        <LandingWorkflow />
        <LandingCta />
      </div>
    </div>
  );
}
