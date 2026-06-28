/** Full-screen looping background video. File: frontend/public/videos/bg.mp4 */

const DEFAULT_SRC = "/videos/bg.mp4";

export default function VideoBackground({ blurred = false, variant = "default", className = "" }) {
  const src = import.meta.env.VITE_BG_VIDEO_URL || DEFAULT_SRC;

  return (
    <div
      className={`video-bg video-bg--${variant} ${blurred ? "video-bg--blurred" : ""} ${className}`.trim()}
      aria-hidden
    >
      <video
        className="video-bg__media"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      >
        <source src={src} type="video/mp4" />
      </video>
      <div className="video-bg__overlay" />
    </div>
  );
}
