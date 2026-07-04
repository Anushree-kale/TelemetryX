import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import "../styles/home.css";

const Features = [
  {
    icon: "🔍",
    title: "Deep Repository Analysis",
    description: "Comprehensive insights into your GitHub repositories",
  },
  {
    icon: "📊",
    title: "Visual Metrics",
    description: "Beautiful charts and data visualizations",
  },
  {
    icon: "⚡",
    title: "Real-time Tracking",
    description: "Monitor your codebase in real-time",
  },
  {
    icon: "🛠️",
    title: "Developer Tools",
    description: "Powerful tools for code analysis",
  },
];

export default function HomePage() {
  const [displayedText, setDisplayedText] = useState("");
  const fullText = "github.com/your-repo";

  useEffect(() => {
    if (displayedText.length < fullText.length) {
      const timer = setTimeout(() => {
        setDisplayedText(fullText.slice(0, displayedText.length + 1));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [displayedText]);

  return (
    <div className="home-page">
      {/* Hero Section with Terminal Aesthetic */}
      <section className="hero-section">
        <div className="hero-content">
          <motion.div
            className="hero-label"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="label-dot">●</span>
            Git Repository Analytics
          </motion.div>

          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <span className="title-line">Understand Your</span>
            <span className="title-line highlight">Codebase</span>
          </motion.h1>

          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            TelemetryX analyzes your GitHub repositories to reveal architectural
            patterns, dependencies, and code quality metrics you never knew existed.
          </motion.p>

          {/* Terminal-style Input Box */}
          <motion.div
            className="terminal-box"
            initial={{ opacity: 0, scale: 0.95 }}
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

      {/* Features Section with Boxes */}
      <section className="features-section">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className="section-title">Powerful Analytics</h2>
          <p className="section-subtitle">
            Everything you need to understand your repository
          </p>
        </motion.div>

        <div className="features-grid">
          {Features.map((feature, index) => (
            <motion.div
              key={index}
              className="feature-box"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true, margin: "-100px" }}
              whileHover={{ y: -8 }}
            >
              <div className="feature-icon">{feature.icon}</div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <motion.div
          className="cta-content"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <h2 className="cta-title">Ready to analyze your repository?</h2>
          <p className="cta-subtitle">
            Join developers who are optimizing their codebase with TelemetryX
          </p>

          <div className="cta-buttons">
            <Link to="/signup" className="btn-cta-primary">
              Get Started Free
            </Link>
            <a
              href="https://github.com/Anushree-kale/TelemetryX"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cta-secondary"
            >
              View on GitHub
            </a>
          </div>
        </motion.div>
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
