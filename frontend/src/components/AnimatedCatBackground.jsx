import "./AnimatedCatBackground.css";

/** Running orange cat — flat vector style matching the reference illustration */
function RunningCat() {
  return (
    <g className="field-cat">
      <ellipse className="field-cat__shadow" cx="0" cy="52" rx="38" ry="6" fill="rgba(20,40,20,0.22)" />

      <g className="field-cat__body">
        {/* tail */}
        <path
          d="M -28 -8 C -52 -18 -58 -38 -42 -44"
          fill="none"
          stroke="#d96a38"
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* back leg */}
        <g className="field-cat__leg field-cat__leg--back">
          <ellipse cx="-18" cy="18" rx="11" ry="16" fill="#eb7d46" transform="rotate(-25)" />
        </g>

        {/* body */}
        <ellipse cx="0" cy="4" rx="34" ry="22" fill="#eb7d46" />

        {/* front leg */}
        <g className="field-cat__leg field-cat__leg--front">
          <ellipse cx="22" cy="20" rx="11" ry="16" fill="#eb7d46" transform="rotate(18)" />
        </g>

        {/* head */}
        <circle cx="30" cy="-14" r="26" fill="#eb7d46" />

        {/* ears */}
        <polygon points="12,-32 18,-52 28,-30" fill="#eb7d46" />
        <polygon points="16,-31 20,-46 26,-31" fill="#fdf0d5" />
        <polygon points="38,-34 48,-54 50,-28" fill="#eb7d46" />
        <polygon points="40,-32 46,-48 48,-30" fill="#fdf0d5" />

        {/* eyes */}
        <circle cx="22" cy="-16" r="7" fill="#2d2419" />
        <circle cx="24" cy="-18" r="2.2" fill="#fff" />
        <circle cx="40" cy="-16" r="7" fill="#2d2419" />
        <circle cx="42" cy="-18" r="2.2" fill="#fff" />

        {/* nose & mouth */}
        <path d="M 30 -6 L 27 -2 L 33 -2 Z" fill="#2d2419" />
        <path
          d="M 22 0 Q 30 6 38 0"
          fill="none"
          stroke="#2d2419"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* whiskers */}
        <line x1="-2" y1="-12" x2="14" y2="-14" stroke="#2d2419" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="-2" y1="-6" x2="14" y2="-8" stroke="#2d2419" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="46" y1="-14" x2="62" y2="-12" stroke="#2d2419" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="46" y1="-8" x2="62" y2="-6" stroke="#2d2419" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </g>
  );
}

function Butterfly() {
  return (
    <g className="field-butterfly">
      <line x1="0" y1="4" x2="0" y2="12" stroke="#1e4fa8" strokeWidth="2" strokeLinecap="round" />
      <g className="field-butterfly__wings">
        <ellipse cx="-8" cy="4" rx="9" ry="7" fill="#6ba4ff" />
        <ellipse cx="8" cy="4" rx="9" ry="7" fill="#6ba4ff" />
        <ellipse cx="-6" cy="10" rx="6" ry="5" fill="#3d7ee8" />
        <ellipse cx="6" cy="10" rx="6" ry="5" fill="#3d7ee8" />
      </g>
    </g>
  );
}

function GrassTuft({ x, h = 28 }) {
  return (
    <g transform={`translate(${x}, 0)`}>
      <path d={`M 0 0 Q -4 ${-h * 0.5} -2 ${-h} Q 0 ${-h * 0.85} 2 ${-h} Q 4 ${-h * 0.5} 0 0`} fill="#3d9a4a" />
      <path d={`M 6 0 Q 10 ${-h * 0.45} 8 ${-h * 0.8} Q 6 ${-h * 0.65} 4 ${-h * 0.85}`} fill="#2f8440" />
      <path d={`M -6 0 Q -10 ${-h * 0.4} -8 ${-h * 0.75}`} fill="#48a855" />
    </g>
  );
}

function Cloud({ x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} className="field-cloud">
      <ellipse cx="0" cy="0" rx="34" ry="18" fill="rgba(255,255,255,0.88)" />
      <ellipse cx="-28" cy="6" rx="22" ry="14" fill="rgba(255,255,255,0.82)" />
      <ellipse cx="28" cy="5" rx="26" ry="15" fill="rgba(255,255,255,0.85)" />
    </g>
  );
}

export default function AnimatedCatBackground() {
  const grassNear = Array.from({ length: 28 }, (_, i) => i * 52);
  const grassFar = Array.from({ length: 20 }, (_, i) => i * 72 + 20);

  return (
    <div className="field-scene" aria-hidden>
      <div className="field-sky">
        <div className="field-sky__gradient" />
        <div className="field-clouds field-clouds--slow">
          <svg viewBox="0 0 1200 120" className="field-clouds__svg" preserveAspectRatio="none">
            <Cloud x={120} y={40} scale={1.1} />
            <Cloud x={420} y={28} scale={0.9} />
            <Cloud x={720} y={50} scale={1.2} />
            <Cloud x={1020} y={32} scale={0.85} />
            <Cloud x={1320} y={44} scale={1} />
          </svg>
        </div>
        <div className="field-clouds field-clouds--fast">
          <svg viewBox="0 0 1200 100" className="field-clouds__svg" preserveAspectRatio="none">
            <Cloud x={200} y={30} scale={0.7} />
            <Cloud x={560} y={22} scale={0.6} />
            <Cloud x={900} y={35} scale={0.75} />
            <Cloud x={1250} y={28} scale={0.65} />
          </svg>
        </div>
      </div>

      <div className="field-ground">
        <div className="field-hill" />

        <div className="field-grass field-grass--far">
          <svg viewBox="0 0 1400 40" className="field-grass__track">
            {grassFar.map((x) => (
              <GrassTuft key={`far-${x}`} x={x} h={18} />
            ))}
            {grassFar.map((x) => (
              <GrassTuft key={`far-dup-${x}`} x={x + 1400} h={18} />
            ))}
          </svg>
        </div>

        <div className="field-grass field-grass--near">
          <svg viewBox="0 0 1400 50" className="field-grass__track">
            {grassNear.map((x) => (
              <GrassTuft key={`near-${x}`} x={x} h={32} />
            ))}
            {grassNear.map((x) => (
              <GrassTuft key={`near-dup-${x}`} x={x + 1400} h={32} />
            ))}
          </svg>
        </div>

        <div className="field-chase">
          <svg viewBox="-60 -70 120 90" className="field-chase__svg">
            <g className="field-chase__butterfly-wrap">
              <Butterfly />
            </g>
            <g className="field-chase__cat-wrap">
              <RunningCat />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
