/** Animated orange cat — CSS/SVG only (tail wag, blink, walk) */

export default function OrangeCat({ variant = "sitting", className = "" }) {
  return (
    <div
      className={`orange-cat orange-cat--${variant} ${className}`.trim()}
      aria-hidden
    >
      <svg viewBox="0 0 120 100" className="orange-cat-svg" role="presentation">
        {/* Tail */}
        <path
          className="cat-tail"
          d="M18 58 Q4 42 8 28 Q12 14 22 22"
          fill="none"
          stroke="#e07a4a"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {/* Body */}
        <ellipse cx="58" cy="62" rx="32" ry="26" fill="#f0946a" />
        <ellipse cx="58" cy="64" rx="26" ry="20" fill="#e07a4a" />
        {/* Head */}
        <circle cx="78" cy="42" r="24" fill="#f0946a" />
        <circle cx="78" cy="44" r="20" fill="#e07a4a" />
        {/* Ears */}
        <polygon points="62,28 58,12 72,24" fill="#e07a4a" />
        <polygon points="94,28 98,12 84,24" fill="#e07a4a" />
        <polygon points="64,26 62,16 70,22" fill="#fce8dc" />
        <polygon points="92,26 94,16 86,22" fill="#fce8dc" />
        {/* Eyes */}
        <g className="cat-eyes">
          <ellipse className="cat-eye cat-eye-left" cx="70" cy="42" rx="5" ry="6" fill="#2d2419" />
          <ellipse className="cat-eye cat-eye-right" cx="86" cy="42" rx="5" ry="6" fill="#2d2419" />
          <circle className="cat-eye-shine" cx="72" cy="40" r="1.5" fill="#fff" />
          <circle className="cat-eye-shine" cx="88" cy="40" r="1.5" fill="#fff" />
        </g>
        {/* Nose & mouth */}
        <path d="M78 48 L74 52 L82 52 Z" fill="#c45c32" />
        <path
          d="M78 52 Q74 56 70 54 M78 52 Q82 56 86 54"
          fill="none"
          stroke="#2d2419"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        {/* Whiskers */}
        <line x1="52" y1="44" x2="64" y2="43" stroke="#2d2419" strokeWidth="0.8" opacity="0.5" />
        <line x1="52" y1="48" x2="64" y2="47" stroke="#2d2419" strokeWidth="0.8" opacity="0.5" />
        <line x1="92" y1="43" x2="104" y2="44" stroke="#2d2419" strokeWidth="0.8" opacity="0.5" />
        <line x1="92" y1="47" x2="104" y2="48" stroke="#2d2419" strokeWidth="0.8" opacity="0.5" />
        {/* Paws */}
        <ellipse cx="42" cy="82" rx="8" ry="5" fill="#e07a4a" />
        <ellipse cx="74" cy="84" rx="8" ry="5" fill="#e07a4a" />
        {/* Legs when walking */}
        {variant === "walking" && (
          <g className="cat-legs">
            <ellipse className="cat-leg cat-leg-1" cx="44" cy="80" rx="6" ry="8" fill="#e07a4a" />
            <ellipse className="cat-leg cat-leg-2" cx="58" cy="82" rx="6" ry="8" fill="#e07a4a" />
            <ellipse className="cat-leg cat-leg-3" cx="68" cy="80" rx="6" ry="8" fill="#e07a4a" />
            <ellipse className="cat-leg cat-leg-4" cx="78" cy="82" rx="6" ry="8" fill="#e07a4a" />
          </g>
        )}
      </svg>
    </div>
  );
}
