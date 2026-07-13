import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import "./TargetCursor.css";

/**
 * TargetCursor
 * A high-performance, lag-free crosshair/bounding box cursor that only triggers
 * when hovering over the option bar container (e.g. .tx-tabgroups, .workspace-tabs).
 * Follows the mouse with a spinning reticle inside the option bar, and snaps to
 * target buttons to frame them exactly. Keeps system cursor active elsewhere.
 */
export default function TargetCursor({
  containerSelector = ".tx-tabgroups, .workspace-tabs",
  targetSelector = ".cursor-target",
  hoverDuration = 0.2,
  cursorColor = "#ffffff",
  cursorColorOnTarget = "#B497CF",
}) {
  const cursorRef = useRef(null);
  const dotRef = useRef(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    let currentTarget = null;
    let isSnapped = false;
    let inContainer = false;

    // Set initial size of the free-following reticle
    gsap.set(cursor, { width: 24, height: 24 });

    // Continuous spin animation for the free-following reticle
    const spinTween = gsap.to(cursor, {
      rotation: "+=360",
      duration: 3,
      ease: "none",
      repeat: -1,
      paused: true,
    });

    const onMouseMove = (e) => {
      const container = e.target.closest(containerSelector);

      if (container) {
        inContainer = true;
        document.documentElement.style.cursor = "none";
        gsap.to(cursor, { opacity: 1, duration: 0.1 });

        const target = e.target.closest(targetSelector);

        if (target) {
          // Hovering on a button -> SNAP to its boundaries
          if (currentTarget !== target) {
            currentTarget = target;
            isSnapped = true;
            spinTween.pause();

            const rect = target.getBoundingClientRect();

            // Snap the wrapper frame around the button
            gsap.to(cursor, {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
              rotation: 0,
              duration: hoverDuration,
              ease: "power2.out",
              overwrite: "auto",
            });

            // Center the dot in the target box
            if (dotRef.current) {
              gsap.to(dotRef.current, {
                x: rect.width / 2,
                y: rect.height / 2,
                backgroundColor: cursorColorOnTarget,
                duration: hoverDuration,
              });
            }

            // Set corner borders to target highlight color
            gsap.to(cursor.querySelectorAll(".target-cursor-corner"), {
              borderColor: cursorColorOnTarget,
              duration: hoverDuration,
            });
          } else {
            // Already snapped, let center dot follow mouse within button boundaries
            const rect = target.getBoundingClientRect();
            if (dotRef.current) {
              gsap.to(dotRef.current, {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                duration: 0.05,
                ease: "power1.out",
                overwrite: "auto",
              });
            }
          }
        } else {
          // Inside the container but not on a button -> FOLLOW mouse with reticle
          if (isSnapped) {
            isSnapped = false;
            currentTarget = null;
          }

          if (!spinTween.isActive()) {
            spinTween.play();
          }

          gsap.to(cursor, {
            x: e.clientX - 12,
            y: e.clientY - 12,
            width: 24,
            height: 24,
            duration: 0.1,
            ease: "power2.out",
            overwrite: "auto",
          });

          if (dotRef.current) {
            gsap.to(dotRef.current, {
              x: 12,
              y: 12,
              backgroundColor: cursorColor,
              duration: 0.1,
            });
          }

          gsap.to(cursor.querySelectorAll(".target-cursor-corner"), {
            borderColor: cursorColor,
            duration: 0.1,
          });
        }
      } else {
        // Outside the target container -> HIDE custom cursor, restore system cursor
        if (inContainer) {
          inContainer = false;
          isSnapped = false;
          currentTarget = null;
          document.documentElement.style.cursor = "";
          spinTween.pause();
          gsap.to(cursor, { opacity: 0, duration: 0.15 });
        }
      }
    };

    const onScroll = () => {
      if (isSnapped && currentTarget) {
        const rect = currentTarget.getBoundingClientRect();
        gsap.set(cursor, {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.documentElement.style.cursor = "";
      spinTween.kill();
    };
  }, [containerSelector, targetSelector, hoverDuration, cursorColor, cursorColorOnTarget]);

  return (
    <div ref={cursorRef} className="target-cursor-wrapper" aria-hidden="true">
      <div ref={dotRef} className="target-cursor-dot" />
      <div className="target-cursor-corner corner-tl" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-tr" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-br" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-bl" style={{ borderColor: cursorColor }} />
    </div>
  );
}
