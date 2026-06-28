/** Full-screen looping background video. File must be at frontend/public/videos/bg.mp4 */

export default function VideoBackground({ blurred = false, className = "" }) {
  return (
    <div
      className={`video-bg ${blurred ? "video-bg--blurred" : ""} ${className}`.trim()}
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
        {/* Hardcoded path — Vite serves /public directly at the root */}
        <source src="/videos/bg.mp4" type="video/mp4" />
      </video>
      <div className="video-bg__overlay" />
    </div>
  );
}
