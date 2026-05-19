import { useCallback, useEffect, useState } from "react";

export default function DeveloperTools({ apiBase }) {
  const [status, setStatus] = useState(null);
  const [adminKey, setAdminKey] = useState("");
  const [retrainMsg, setRetrainMsg] = useState(null);
  const [retrainBusy, setRetrainBusy] = useState(false);

  const webhookUrl = `${apiBase.replace(/\/$/, "")}/webhook`;

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/model/status`);
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, [apiBase]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const retrain = async (e) => {
    e.preventDefault();
    setRetrainMsg(null);
    if (!adminKey.trim()) {
      setRetrainMsg("Enter the admin key from your server configuration.");
      return;
    }
    setRetrainBusy(true);
    try {
      const res = await fetch(`${apiBase}/model/retrain`, {
        method: "POST",
        headers: { "X-Admin-Key": adminKey.trim() },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = body.detail;
        const msg = Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || res.statusText;
        throw new Error(msg);
      }
      setRetrainMsg(`✓ ${body.message || "Retrain complete."}`);
      loadStatus();
    } catch (err) {
      setRetrainMsg(`✗ ${err.message}`);
    } finally {
      setRetrainBusy(false);
    }
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="devtools-grid">
      <div className="card">
        <h2>GitHub webhook</h2>
        <p className="card-hint">
          Point a GitHub repository webhook at this URL (push events). Pushes to{" "}
          <code>main</code>, <code>master</code>, <code>dev</code>, or{" "}
          <code>develop</code> queue a new analysis. Other branches are ignored.
        </p>
        <div className="devtools-url-row">
          <code className="devtools-url">{webhookUrl}</code>
          <button type="button" className="filter-btn" onClick={() => copy(webhookUrl)}>
            Copy URL
          </button>
        </div>
        <p className="card-hint small muted">
          The URL must be reachable from GitHub&apos;s servers (use a tunnel such as ngrok
          for local development).
        </p>
      </div>

      <div className="card">
        <h2>Debt model</h2>
        {status && (
          <ul className="model-status-list">
            <li>
              <strong>Model in memory</strong>: {status.model_loaded ? "Yes" : "No"}
            </li>
            <li>
              <strong>Model file on disk</strong>: {status.model_file_exists ? "Yes" : "No"}
            </li>
            <li>
              <strong>Training rows available</strong>: {status.training_sample_count}
            </li>
          </ul>
        )}
        {!status && <p className="card-hint">Could not load model status.</p>}
        <form onSubmit={retrain} className="retrain-form">
          <label className="devtools-label">
            X-Admin-Key
            <input
              type="password"
              className="input-url devtools-key"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Same as ADMIN_KEY on the API server"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={retrainBusy}>
            {retrainBusy ? "Retraining…" : "Retrain XGBoost model"}
          </button>
        </form>
        {retrainMsg && <p className="devtools-retrain-msg">{retrainMsg}</p>}
        <p className="card-hint small muted">
          Retraining needs at least three module rows with complexity metrics in the database.
        </p>
      </div>
    </div>
  );
}
