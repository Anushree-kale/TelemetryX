import OrangeCat from "./OrangeCat";
import "./AnimatedCatBackground.css";

export default function AnimatedCatBackground() {
  return (
    <div className="cat-bg" aria-hidden="true">
      <div className="cat-bg__sky">
        {/* Subtle stars */}
        <div className="star star-1"></div>
        <div className="star star-2"></div>
        <div className="star star-3"></div>
        <div className="star star-4"></div>
        <div className="star star-5"></div>
      </div>
      
      <div className="cat-bg__hills">
        <div className="hill hill-back"></div>
        <div className="hill hill-front"></div>
      </div>

      <div className="cat-runner-wrapper">
        <div className="cat-runner-bounce">
          <OrangeCat variant="walking" mood="watching" className="cat-runner" />
        </div>
      </div>
      
      <div className="butterfly-wrapper">
        <svg className="butterfly" viewBox="0 0 100 100">
          <g className="butterfly-wings">
            <path className="wing-left" d="M50 50 Q 20 10, 10 30 Q 0 50, 50 50 Z" fill="#60a5fa" opacity="0.8" />
            <path className="wing-right" d="M50 50 Q 80 10, 90 30 Q 100 50, 50 50 Z" fill="#60a5fa" opacity="0.8" />
            <path className="wing-left-bottom" d="M50 50 Q 20 90, 30 70 Q 40 50, 50 50 Z" fill="#3b82f6" opacity="0.9" />
            <path className="wing-right-bottom" d="M50 50 Q 80 90, 70 70 Q 60 50, 50 50 Z" fill="#3b82f6" opacity="0.9" />
          </g>
          <ellipse cx="50" cy="50" rx="2" ry="12" fill="#1e3a8a" />
        </svg>
      </div>

      <div className="cat-bg__grass-foreground"></div>
    </div>
  );
}
