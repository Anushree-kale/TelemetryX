import { useCallback, useEffect, useState } from "react";
import { apiFetch, getApiKey, setApiKey } from "../api";

export default function DeveloperTools({ apiBase }) {
  const [status, setStatus] = useState(null);
  const [adminKey, setAdminKey] = useState("");
  const [retrainMsg, setRetrainMsg] = useState(null);
  const [retrainBusy, setRetrainBusy] = useState(false);
  const [apiKey, setApiKeyState] = useState(() => getApiKey());
  const [newTeamKeyName, setNewTeamKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${apiBase.replace(/\/$/, "")}/webhook`;

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch(apiBase, "/model/status");
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, [apiBase]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const retrainEndpoint = async (path, successLabel) => {
    setRetrainMsg(null);
    if (!adminKey.trim()) {
      setRetrainMsg("Enter the admin key from your server configuration.");
      return;
    }
    setRetrainBusy(true);
    try {
      const res = await apiFetch(apiBase, path, {
        method: "POST",
        headers: { "X-Admin-Key": adminKey.trim() },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = body.detail;
        const msg = Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || res.statusText;
        throw new Error(msg);
      }
      setRetrainMsg(`✓ ${body.message || successLabel}`);
      loadStatus();
    } catch (err) {
      setRetrainMsg(`✗ ${err.message}`);
    } finally {
      setRetrainBusy(false);
    }
  };

  const retrain = (e) => {
    e.preventDefault();
    retrainEndpoint("/model/retrain", "Retrain complete.");
  };

  const saveApiKey = (e) => {
    e.preventDefault();
    setApiKey(apiKey);
    setRetrainMsg("✓ API key saved for this browser session.");
  };

  const createTeamKey = async (e) => {
    e.preventDefault();
    setCreatedKey(null);
    if (!adminKey.trim()) {
      setRetrainMsg("Enter the admin key to create team API keys.");
      return;
    }
    setRetrainBusy(true);
    try {
      const res = await apiFetch(apiBase, "/admin/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey.trim(),
        },
        body: JSON.stringify({
          name: newTeamKeyName.trim() || "default",
          team: newTeamKeyName.trim() || "default",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || res.statusText);
      setCreatedKey(body.api_key);
      setRetrainMsg("✓ New team API key created — copy it now.");
    } catch (err) {
      setRetrainMsg(`✗ ${err.message}`);
    } finally {
      setRetrainBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(webhookUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const modelReady = status?.model_loaded && status?.model_file_exists;
  const trainingCount = status?.training_sample_count ?? 0;
  const canRetrain = trainingCount >= 3;

  return (
    <div className="devtools-page">

      {/* ── Page intro ── */}
      <div className="devtools-intro">
        <h2 className="devtools-page-title">Admin &amp; Automation</h2>
        <p className="devtools-page-sub">
          Two things live here: <strong>automatic analysis</strong> whenever you push code to GitHub,
          and <strong>model retraining</strong> to keep debt scores accurate as your codebase grows.
          You only need to set these up once.
        </p>
      </div>

      <div className="devtools-grid">

        {/* ── CARD 1: GitHub webhook ── */}
        <div className="card devtools-card">
          <div className="devtools-card-icon-row">
            <span className="devtools-card-icon">🔗</span>
            <div>
              <h2 className="devtools-card-title">Auto-analyse on every push</h2>
              <p className="devtools-card-purpose">
                Connect GitHub so TelemetryX runs a new analysis automatically every time you
                push code — no manual clicking needed.
              </p>
            </div>
          </div>

          <div className="devtools-steps">
            <div className="devtools-step">
              <span className="devtools-step-num">1</span>
              <div>
                <strong>Copy this URL</strong>
                <div className="devtools-url-row">
                  <code className="devtools-url">{webhookUrl}</code>
                  <button type="button" className={`filter-btn devtools-copy-btn${copied ? " devtools-copy-btn--done" : ""}`} onClick={copy}>
                    {copied ? "✓ Copied" : "Copy URL"}
                  </button>
                </div>
                <p className="devtools-step-hint">
                  If you&apos;re running locally, expose it first with a tunnel tool like{" "}
                  <a href="https://ngrok.com" target="_blank" rel="noreferrer" className="devtools-link">ngrok</a>.
                </p>
              </div>
            </div>

            <div className="devtools-step">
              <span className="devtools-step-num">2</span>
              <div>
                <strong>Add it as a webhook in GitHub</strong>
                <p className="devtools-step-hint">
                  Go to your repo → <em>Settings → Webhooks → Add webhook</em>. Paste the URL above,
                  set content type to <code>application/json</code>, and choose the <em>Push</em> event.
                </p>
              </div>
            </div>

            <div className="devtools-step">
              <span className="devtools-step-num">3</span>
              <div>
                <strong>That&apos;s it</strong>
                <p className="devtools-step-hint">
                  Pushes to <code>main</code>, <code>master</code>, <code>dev</code>, or{" "}
                  <code>develop</code> will queue a fresh analysis. Other branches are ignored.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── CARD 2: Debt model ── */}
        <div className="card devtools-card">
          <div className="devtools-card-icon-row">
            <span className="devtools-card-icon">🧠</span>
            <div>
              <h2 className="devtools-card-title">Debt-scoring model</h2>
              <p className="devtools-card-purpose">
                TelemetryX uses an XGBoost machine-learning model to score each file&apos;s
                technical debt. The more code you&apos;ve analysed, the smarter it gets —
                retrain it here whenever you want it to learn from fresh data.
              </p>
            </div>
          </div>

          {/* Model status */}
          <div className="devtools-status-block">
            {status ? (
              <>
                <div className={`devtools-status-pill ${modelReady ? "devtools-status-pill--ok" : "devtools-status-pill--warn"}`}>
                  {modelReady ? "✓ Model loaded and ready" : "⚠ Model not loaded"}
                </div>
                <div className="devtools-status-meta">
                  <span>
                    Model file on disk:{" "}
                    <strong>{status.model_file_exists ? "Yes" : "No"}</strong>
                  </span>
                  <span>
                    Modules available for training:{" "}
                    <strong className={canRetrain ? "" : "devtools-warn-text"}>
                      {trainingCount}
                      {!canRetrain && " (need at least 3)"}
                    </strong>
                  </span>
                </div>
              </>
            ) : (
              <div className="devtools-status-pill devtools-status-pill--offline">
                ○ Backend offline — model status unavailable
              </div>
            )}
          </div>

          {/* Retrain form */}
          <form onSubmit={retrain} className="retrain-form">
            <label className="devtools-label">
              Admin key
              <span className="devtools-label-sub">
                The <code>ADMIN_KEY</code> value set in your API server&apos;s environment — this
                prevents anyone else from triggering a retrain.
              </span>
              <input
                type="password"
                className="input-url devtools-key"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Paste your ADMIN_KEY here"
                autoComplete="off"
              />
            </label>
            <button
                type="submit"
                className="btn-primary"
                disabled={retrainBusy || !canRetrain}
                title={!canRetrain ? "Need at least 3 analysed modules before retraining" : ""}
              >
                {retrainBusy ? "Retraining…" : "Retrain debt model"}
              </button>
          </form>

          {retrainMsg && (
            <p className={`devtools-retrain-msg ${retrainMsg.startsWith("✓") ? "devtools-retrain-msg--ok" : "devtools-retrain-msg--err"}`}>
              {retrainMsg}
            </p>
          )}
        </div>

        {/* ── CARD 3: API access ── */}
        <div className="card devtools-card">
          <div className="devtools-card-icon-row">
            <span className="devtools-card-icon">🔑</span>
            <div>
              <h2 className="devtools-card-title">API access</h2>
              <p className="devtools-card-purpose">
                When auth is enabled, every request needs an <code>X-API-Key</code> header.
                Save your team key here or create new keys with the admin key.
              </p>
            </div>
          </div>

          <form onSubmit={saveApiKey} className="retrain-form">
            <label className="devtools-label">
              Your API key
              <input
                type="password"
                className="input-url devtools-key"
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder="tx_… or bootstrap key from TELEMETRYX_API_KEYS"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="btn-primary">
              Save API key
            </button>
          </form>

          <form onSubmit={createTeamKey} className="retrain-form" style={{ marginTop: "1rem" }}>
            <label className="devtools-label">
              Create team key (admin)
              <input
                type="text"
                className="input-url devtools-key"
                value={newTeamKeyName}
                onChange={(e) => setNewTeamKeyName(e.target.value)}
                placeholder="Team or key name"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={retrainBusy}>
              Generate API key
            </button>
          </form>

          {createdKey && (
            <p className="devtools-retrain-msg devtools-retrain-msg--ok">
              New key (shown once): <code>{createdKey}</code>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}