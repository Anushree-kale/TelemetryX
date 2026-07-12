import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * TargetCursor
 * A GSAP-powered crosshair cursor that snaps to elements with the
 * `cursor-target` class. Based on the reactbits.dev TargetCursor animation.
 *
 * Props:
 *  spinDuration     – rotation loop duration in seconds (default 2)
 *  hideDefaultCursor – hide the OS cursor globally (default true)
 *  parallaxOn       – whether to apply slight parallax on target hover (default true)
 *  hoverDuration    – snap/release tween duration in seconds (default 0.2)
 *  cursorColor      – default cursor ring colour (default "#ffffff")
 *  cursorColorOnTarget – cursor ring colour while snapped (default "#B497CF")
 */
export default function TargetCursor({
  spinDuration = 2,
  hideDefaultCursor = true,
  parallaxOn = true,
  hoverDuration = 0.2,
  cursorColor = "#ffffff",
  cursorColorOnTarget = "#B497CF",
}) {
  const cursorRef = useRef(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    // Optionally hide the system cursor
    const styleTag = document.createElement("style");
    if (hideDefaultCursor) {
      styleTag.textContent = "*, *::before, *::after { cursor: none !important; }";
      document.head.appendChild(styleTag);
    }

    // Continuous spin animation
    const spinTween = gsap.to(cursor, {
      rotation: "+=360",
      duration: spinDuration,
      ease: "none",
      repeat: -1,
    });

    let currentTarget = null;
    let isSnapped = false;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    // Follow the mouse smoothly when not snapped
    const followMouse = gsap.quickTo(cursor, "x", {
      duration: 0.12,
      ease: "power2.out",
    });
    const followMouseY = gsap.quickTo(cursor, "y", {
      duration: 0.12,
      ease: "power2.out",
    });

    const onMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!isSnapped) {
        followMouse(mouseX);
        followMouseY(mouseY);
      } else if (parallaxOn && currentTarget) {
        // Subtle parallax while snapped
        const rect = currentTarget.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (mouseX - cx) * 0.08;
        const dy = (mouseY - cy) * 0.08;
        gsap.to(cursor, {
          x: cx + dx,
          y: cy + dy,
          duration: hoverDuration,
          ease: "power2.out",
        });
      }
    };

    const snapToTarget = (target) => {
      currentTarget = target;
      isSnapped = true;
      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      gsap.to(cursor, {
        x: cx,
        y: cy,
        scale: 1.35,
        duration: hoverDuration,
        ease: "power3.out",
      });

      // Colour switch
      gsap.to(cursor.querySelectorAll("rect, line, circle"), {
        stroke: cursorColorOnTarget,
        duration: hoverDuration * 0.8,
        ease: "none",
      });

      // Speed up spin on hover
      spinTween.timeScale(2.5);
    };

    const releaseTarget = () => {
      currentTarget = null;
      isSnapped = false;

      gsap.to(cursor, {
        x: mouseX,
        y: mouseY,
        scale: 1,
        duration: hoverDuration * 1.4,
        ease: "elastic.out(1, 0.5)",
      });

      gsap.to(cursor.querySelectorAll("rect, line, circle"), {
        stroke: cursorColor,
        duration: hoverDuration,
        ease: "none",
      });

      spinTween.timeScale(1);
    };

    // Event delegation on document
    const onMouseOver = (e) => {
      const target = e.target.closest(".cursor-target");
      if (target && target !== currentTarget) snapToTarget(target);
    };

    const onMouseOut = (e) => {
      const target = e.target.closest(".cursor-target");
      if (!target && isSnapped) {
        // Check if we moved to another cursor-target
        const related = e.relatedTarget?.closest?.(".cursor-target");
        if (!related) releaseTarget();
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);

    return () => {
      spinTween.kill();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      if (hideDefaultCursor && styleTag.parentNode) {
        document.head.removeChild(styleTag);
      }
    };
  }, [spinDuration, hideDefaultCursor, parallaxOn, hoverDuration, cursorColor, cursorColorOnTarget]);

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 36,
        height: 36,
        pointerEvents: "none",
        zIndex: 99999,
        transform: "translate(-50%, -50%)",
        willChange: "transform",
      }}
    >
      {/* SVG crosshair / target reticle */}
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer square */}
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="33"
          rx="2"
          stroke={cursorColor}
          strokeWidth="1.2"
          strokeDasharray="6 4"
        />
        {/* Centre dot */}
        <circle cx="18" cy="18" r="2" stroke={cursorColor} strokeWidth="1.2" />
        {/* Cross lines */}
        <line x1="18" y1="1.5" x2="18" y2="9" stroke={cursorColor} strokeWidth="1.2" />
        <line x1="18" y1="27" x2="18" y2="34.5" stroke={cursorColor} strokeWidth="1.2" />
        <line x1="1.5" y1="18" x2="9" y2="18" stroke={cursorColor} strokeWidth="1.2" />
        <line x1="27" y1="18" x2="34.5" y2="18" stroke={cursorColor} strokeWidth="1.2" />
      </svg>
    </div>
  );
}
