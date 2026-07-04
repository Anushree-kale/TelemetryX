import { useEffect, useRef, useState } from "react";

const GLYPHS = "!@#$%^&*()_+-=<>?/\\[]{}Xx";

function scrambleFrame(text, progress) {
  const locked = Math.floor(progress * text.length);
  return text
    .split("")
    .map((char, i) => {
      if (i < locked || char === " ") return char;
      return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    })
    .join("");
}

export default function ScrambleText({ text, className = "", duration = 400 }) {
  const [display, setDisplay] = useState(text);
  const animating = useRef(false);

  const run = () => {
    if (animating.current) return;
    animating.current = true;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplay(scrambleFrame(text, t));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setDisplay(text);
        animating.current = false;
      }
    };

    requestAnimationFrame(tick);
  };

  return (
    <span className={className} onMouseEnter={run}>
      {display}
    </span>
  );
}
