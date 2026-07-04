import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setUser } from "../auth";
import InterfaceBackground from "../components/InterfaceBackground";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setStatus("error");
      setErrorMsg(
        oauthError === "github_denied"
          ? "GitHub authorization was denied."
          : "GitHub login failed. Please try again."
      );
      return;
    }

    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("auth_failed");
        return res.json();
      })
      .then((user) => {
        setUser({
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url,
          email: user.email,
          provider: "github",
          db_id: user.id,
        });
        navigate("/app", { replace: true });
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Authentication failed. Please try again.");
      });
  }, [navigate, searchParams]);

  if (status === "error") {
    return (
      <InterfaceBackground className="oauth-callback-page">
        <div className="oauth-callback-box">
          <div className="oauth-callback-icon oauth-callback-icon--error">✕</div>
          <p className="oauth-callback-error">{errorMsg}</p>
          <button
            type="button"
            className="auth-submit"
            onClick={() => navigate("/login", { replace: true })}
          >
            Back to sign in
          </button>
        </div>
      </InterfaceBackground>
    );
  }

  return (
    <InterfaceBackground className="oauth-callback-page">
      <div className="oauth-callback-box">
        <div className="oauth-callback-spinner" />
        <p className="oauth-callback-text">Signing you in with GitHub&hellip;</p>
      </div>
    </InterfaceBackground>
  );
}
