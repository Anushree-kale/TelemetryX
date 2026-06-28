import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  loginWithCredentials,
  loginWithGitHub,
  signUpWithCredentials,
} from "../auth";
import BrandTitle from "../components/BrandTitle";
import OrangeCat from "../components/OrangeCat";
import VideoBackground from "../components/VideoBackground";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function AuthPage({ mode = "login" }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idleTimer = useRef(null);
  const [activeMode, setActiveMode] = useState(mode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  // Surface errors bounced back from OAuth redirect (e.g. ?error=github_denied)
  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError === "github_denied")
      setError("GitHub authorization was denied.");
    else if (oauthError === "github_failed")
      setError("GitHub login failed. Please try again.");
  }, [searchParams]);

  const catMood = isTyping ? "watching" : "sleeping";

  const resetIdleTimer = useCallback(() => {
    setIsTyping(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIsTyping(false), 1200);
  }, []);

  useEffect(() => {
    return () => clearTimeout(idleTimer.current);
  }, []);

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  const goToApp = () => navigate("/app", { replace: true });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    try {
      if (activeMode === "signup") {
        signUpWithCredentials(username, password, confirmPassword);
      } else {
        loginWithCredentials(username, password);
      }
      goToApp();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    }
  };

  const handleGitHub = () => {
    setError("");
    setGithubLoading(true);
    loginWithGitHub(); // redirects browser — no return value
  };

  return (
    <div className="auth-page">
      <VideoBackground blurred variant="auth" />

      <main className="auth-page__main">
        <div className="auth-box">
          <div className="auth-box__cat">
            <OrangeCat variant="sitting" mood={catMood} />
          </div>

          <div className="auth-box__header">
            <BrandTitle size="md" />
            <p className="auth-box__subtitle">
              {activeMode === "signup" ? "Create your account" : "Welcome back"}
            </p>
          </div>

          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`auth-tab ${activeMode === "login" ? "auth-tab--active" : ""}`}
              onClick={() => {
                setActiveMode("login");
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              className={`auth-tab ${activeMode === "signup" ? "auth-tab--active" : ""}`}
              onClick={() => {
                setActiveMode("signup");
                setError("");
              }}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <p className="auth-error">{error}</p>}

            <div className="auth-field">
              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  resetIdleTimer();
                }}
                onFocus={resetIdleTimer}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={
                  activeMode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  resetIdleTimer();
                }}
                onFocus={resetIdleTimer}
              />
            </div>

            {activeMode === "signup" && (
              <div className="auth-field">
                <label htmlFor="auth-confirm">Re-enter password</label>
                <input
                  id="auth-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    resetIdleTimer();
                  }}
                  onFocus={resetIdleTimer}
                />
              </div>
            )}

            <button type="submit" className="auth-submit">
              {activeMode === "signup" ? "Create account" : "Sign in"}
            </button>

            <div className="auth-divider">or</div>

            <button
              type="button"
              className="auth-github-inline"
              onClick={handleGitHub}
              disabled={githubLoading}
            >
              <GitHubIcon />
              {githubLoading
                ? "Redirecting to GitHub…"
                : "Continue with GitHub"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
