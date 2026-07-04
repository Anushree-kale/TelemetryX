import { useEffect, useRef } from "react";

export default function AnimatedNoise({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let frameId = 0;
    let tick = 0;

    const resize = () => {
      canvas.width = Math.max(1, Math.floor(canvas.offsetWidth / 2));
      canvas.height = Math.max(1, Math.floor(canvas.offsetHeight / 2));
    };

    const draw = () => {
      tick += 1;
      if (tick % 2 === 0) {
        const { width, height } = canvas;
        const imageData = ctx.createImageData(width, height);
        const { data } = imageData;
        for (let i = 0; i < data.length; i += 4) {
          const v = Math.random() * 255;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      }
      frameId = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    frameId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return <canvas ref={canvasRef} className={`landing__noise ${className}`.trim()} aria-hidden />;
}
