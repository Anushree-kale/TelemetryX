# TelemetryX Synthesis API

Standalone microservice for **schema-agnostic synthetic telemetry**. Monetize this separately from the main TelemetryX analysis API.

## Quick start

```bash
# From repo root — runs only the synthesis container (no Postgres/Redis required)
docker compose up synthesis --build

# Or run locally
cd synthesis_service
pip install -r requirements.txt
PYTHONPATH=../backend uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

Open **http://localhost:8001/docs** for interactive OpenAPI.

## Authentication

| Environment | Behavior |
|-------------|----------|
| Dev (default) | `SYNTHESIS_AUTH_DISABLED=true` in docker-compose — no key required |
| Production | Set `TELEMETRYX_ENV=production` and `SYNTHESIS_API_KEY=<secret>`; pass `X-API-Key` on every request except `/health` |

```bash
curl -H "X-API-Key: $SYNTHESIS_API_KEY" http://localhost:8001/v1/methods
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + auth status |
| GET | `/v1/methods` | Supported algorithms (GMM tabular, LSTM sequence) |
| POST | `/v1/tabular/generate` | Fit GMM on real rows, sample synthetic tabular data |
| POST | `/v1/sequence/generate` | Fit LSTM on time-series history, forecast synthetic steps |
| POST | `/v1/validate` | KS / JS / TVD fidelity gate between real vs synthetic |
| POST | `/v1/tabular/pipeline` | Generate + validate in one call (typical SaaS workflow) |

## Example: tabular generate

```bash
curl -X POST http://localhost:8001/v1/tabular/generate \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [
      {"lines_of_code": 120, "churn_90d": 3, "cyclomatic_complexity": 8},
      {"lines_of_code": 340, "churn_90d": 12, "cyclomatic_complexity": 15},
      {"lines_of_code": 90, "churn_90d": 1, "cyclomatic_complexity": 4}
    ],
    "numeric_columns": ["lines_of_code", "churn_90d", "cyclomatic_complexity"],
    "n_samples": 50
  }'
```

## Example: full pipeline (generate + validate)

```bash
curl -X POST http://localhost:8001/v1/tabular/pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [...],
    "numeric_columns": ["lines_of_code", "churn_90d"],
    "n_samples": 100
  }'
```

## Architecture

- **Engine:** `backend/privacy/synthesis_engine.py` (shared with main API privacy tab)
- **Algorithms:** Gaussian mixture (tabular), LSTM next-step regression (sequences) — not CTGAN/TimeGAN
- **Port:** 8001 (main TelemetryX API stays on 8000)

## Production checklist

1. `SYNTHESIS_API_KEY` — strong random secret
2. `TELEMETRYX_ENV=production`
3. Do **not** set `AUTH_DISABLED` / `SYNTHESIS_AUTH_DISABLED`
4. Put behind HTTPS reverse proxy; rate-limit at gateway if needed
