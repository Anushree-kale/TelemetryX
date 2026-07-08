import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api";

export default function DeveloperTools({ apiBase }) {
  const [status, setStatus] = useState(null);
  const [adminKey, setAdminKey] = useState("");
  const [retrainMsg, setRetrainMsg] = useState(null);
  const [retrainBusy, setRetrainBusy] = useState(false);

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

  const retrain = async (e) => {
    e.preventDefault();
    setRetrainMsg(null);
    if (!adminKey.trim()) {
      setRetrainMsg("Enter the admin key from your server configuration.");
      return;
    }
    setRetrainBusy(true);
    try {
      const res = await apiFetch(apiBase, "/model/retrain", {
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

  const modelReady = status?.model_loaded && status?.model_file_exists;
  const trainingCount = status?.training_sample_count ?? 0;
  const canRetrain = trainingCount >= 3;

  return (
    <div className="devtools-page">

      {/* ── Page intro ── */}
      <div className="devtools-intro">
        <h2 className="devtools-page-title">Admin</h2>
        <p className="devtools-page-sub">
          Retrain the debt-scoring model to keep debt scores accurate as your codebase grows.
        </p>
      </div>

      <div className="devtools-grid">

        {/* ── Debt model ── */}
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

      </div>
    </div>
  );
}