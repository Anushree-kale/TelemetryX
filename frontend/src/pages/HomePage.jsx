import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import "../styles/home.css";

const Features = [
  {
    title: "Deep Analysis",
    description: "Understand code patterns",
  },
  {
    title: "Visual Insights",
    description: "See metrics at a glance",
  },
  {
    title: "Real-time Data",
    description: "Live repository tracking",
  },
];

export default function HomePage() {
  const [displayedText, setDisplayedText] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const fullText = "analyze your repository";

  useEffect(() => {
    if (displayedText.length < fullText.length) {
      const timer = setTimeout(() => {
        setDisplayedText(fullText.slice(0, displayedText.length + 1));
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [displayedText]);

  // Rotating words for animated hero
  const words = ["Repository", "Codebase", "Project"];
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % words.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <motion.div
            className="hero-label"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="label-dot">◆</span>
            TELEMETRY X
          </motion.div>

          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <span className="title-main">Analyze Your</span>
            <motion.span
              className="title-word"
              key={wordIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}
            >
              {words[wordIndex]}
            </motion.span>
          </motion.h1>

          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            Uncover insights from your GitHub repositories with visual metrics and real-time analysis
          </motion.p>

          {/* Command-style Input Box */}
          <motion.div
            className="cmd-box"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <div className="terminal-header">
              <div className="terminal-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <span className="terminal-title">analyze repository</span>
            </div>

            <div className="terminal-body">
              <div className="terminal-prompt">
                <span className="prompt-symbol">$</span>
                <span className="prompt-text">telemetry-x analyze</span>
              </div>

              <div className="terminal-input-line">
                <span className="input-symbol">&gt;</span>
                <input
                  type="text"
                  placeholder="github.com/your-org/your-repo"
                  className="terminal-input"
                />
                <span className="cursor">▌</span>
              </div>

              <div className="terminal-buttons">
                <Link to="/login" className="btn-analyze-primary">
                  Analyze Repository
                </Link>
                <Link to="/signup" className="btn-secondary">
                  View Demo
                </Link>
              </div>
            </div>
          </motion.div>

          <motion.p
            className="hero-note"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            Connect your GitHub → Get instant insights in seconds
          </motion.p>
        </div>

        {/* Animated Background Elements */}
        <div className="hero-bg-elements">
          <motion.div
            className="element element-1"
            animate={{
              y: [0, -20, 0],
              x: [0, 10, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="element element-2"
            animate={{
              y: [0, 20, 0],
              x: [0, -10, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="element element-3"
            animate={{
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className="section-title">What you can do</h2>
        </motion.div>

        <div className="features-grid">
          {Features.map((feature, index) => (
            <motion.div
              key={index}
              className="feature-box"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              viewport={{ once: true, margin: "-100px" }}
              whileHover={{ x: 10, transition: { duration: 0.3 } }}
            >
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* GitHub Reference Footer */}
      <footer className="footer">
        <div className="footer-content">
          <p className="footer-text">
            TelemetryX — Open source repository analysis platform
          </p>
          <a
            href="https://github.com/Anushree-kale/TelemetryX"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
          >
            <span>github.com/Anushree-kale/TelemetryX</span>
            <span className="link-arrow">→</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
