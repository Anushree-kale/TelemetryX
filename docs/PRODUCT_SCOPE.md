# TelemetryX — shipped vs. roadmap

Use this document for demos, pitches, and public copy so claims match the repository.

## Privacy & synthetic data (shipped)

- **Tabular synthesis:** Gaussian mixture model (`TabularGMMSynthesizer`) over numeric telemetry columns.
- **Time-series synthesis:** LSTM next-step regression (`TimeSeriesLSTMSynthesizer`) for cohort trend replicas.
- **Compliance checks:** KS / Jensen–Shannon / TVD fidelity gates via `validate_fidelity`.
- **Differential privacy:** ε–δ perturbation and k-anonymity redaction in the DP engine.

## Not shipped (do not claim publicly)

- **Image synthesis / VAE:** Not implemented. There is no variational autoencoder, image encoder, or visual artifact generation in this codebase. Do not list image VAE in product vision slides unless it is explicitly labeled future research.

## Burnout Radar (shipped, synthetic-trained by default)

- Cohort-level XGBoost classifier over git-derived metrics (concentration, firefighting ratio, activity gap, author breadth).
- Default weights come from **synthetic** cohort data with heuristic labels.
- **Labeled validation:** Drop anonymized cohort rows into `backend/data/burnout_validation.csv` (see `burnout_validation.csv.example`). With ≥30 rows, retrain uses real labels; with ≥5 rows, hold-out metrics (accuracy, ROC-AUC) appear in API `model_info`.

## Production deployment

- Set `TELEMETRYX_ENV=production` (or `ENV=production`) and a strong `ADMIN_KEY`. The API refuses to start in production without `ADMIN_KEY`.
- Set `TELEMETRYX_API_KEYS` or create keys via `POST /admin/api-keys` (requires `X-Admin-Key`). All non-public routes require `X-API-Key`.
- Standalone synthesis API runs on port **8001** via `docker compose up synthesis`. Set `SYNTHESIS_API_KEY` in production.

## CI

- GitHub Actions runs `pytest` in `backend/tests/` against PostgreSQL and Redis service containers.
