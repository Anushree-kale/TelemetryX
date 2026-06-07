"""
TelemetryX Synthesis Service — schema-agnostic synthetic data API.

Run: uvicorn app:app --host 0.0.0.0 --port 8001
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Shared engine lives in backend/privacy
_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from privacy.synthesis_engine import (  # noqa: E402
    TabularGMMSynthesizer,
    TimeSeriesLSTMSynthesizer,
    validate_fidelity,
)

import os


def _synthesis_auth_disabled() -> bool:
    if os.getenv("AUTH_DISABLED", "").lower() in ("1", "true", "yes"):
        return True
    env = os.getenv("TELEMETRYX_ENV", os.getenv("ENV", "development")).lower()
    if env in ("production", "prod"):
        return False
    return not bool(os.getenv("SYNTHESIS_API_KEY", "").strip())


class SynthesisAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if _synthesis_auth_disabled():
            return await call_next(request)

        path = request.url.path.rstrip("/") or "/"
        if path in ("/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        expected = os.getenv("SYNTHESIS_API_KEY", "").strip()
        provided = request.headers.get("X-API-Key", "").strip()
        if not expected or provided != expected:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing X-API-Key"})
        return await call_next(request)


app = FastAPI(
    title="TelemetryX Synthesis Service",
    version="1.0.0",
    description=(
        "Schema-agnostic synthetic tabular and time-series generation. "
        "Uses GMM + LSTM — not CTGAN/TimeGAN adversarial models. "
        "Image / VAE synthesis is out of scope for this service."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SynthesisAuthMiddleware)


class TabularGenerateRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(..., description="Real rows (any JSON object shape)")
    numeric_columns: list[str] = Field(..., min_length=1)
    n_samples: int = Field(100, ge=1, le=100_000)
    n_components: int = Field(3, ge=1, le=20)
    row_id_column: str | None = Field(None, description="Optional id column on synthetic rows")


class SequenceGenerateRequest(BaseModel):
    history: list[dict[str, Any]] = Field(..., min_length=2)
    numeric_columns: list[str] = Field(..., min_length=1)
    n_steps: int = Field(..., ge=1, le=10_000)
    hidden_dim: int = Field(16, ge=4, le=256)
    epochs: int = Field(100, ge=1, le=500)


class ValidateRequest(BaseModel):
    real_rows: list[dict[str, Any]]
    synthetic_rows: list[dict[str, Any]]
    numeric_columns: list[str] = Field(..., min_length=1)
    ks_threshold: float = 0.2
    js_threshold: float = 0.3
    tvd_threshold: float = 0.3
    pass_rate_threshold: float = 0.75


class TabularPipelineRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(..., description="Real rows to fit and replicate")
    numeric_columns: list[str] = Field(..., min_length=1)
    n_samples: int = Field(100, ge=1, le=100_000)
    n_components: int = Field(3, ge=1, le=20)
    row_id_column: str | None = None
    ks_threshold: float = 0.2
    js_threshold: float = 0.3
    tvd_threshold: float = 0.3
    pass_rate_threshold: float = 0.75


@app.get("/")
def root():
    return {
        "service": "telemetryx-synthesis",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": [
            "/v1/methods",
            "/v1/tabular/generate",
            "/v1/tabular/pipeline",
            "/v1/sequence/generate",
            "/v1/validate",
        ],
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "telemetryx-synthesis",
        "auth_required": not _synthesis_auth_disabled(),
    }


@app.get("/v1/methods")
def list_methods():
    return {
        "tabular": {
            "class": "TabularGMMSynthesizer",
            "algorithm": "Gaussian mixture model",
            "adversarial": False,
        },
        "sequence": {
            "class": "TimeSeriesLSTMSynthesizer",
            "algorithm": "LSTM next-step regression",
            "adversarial": False,
        },
        "deprecated_aliases": ["CTGANSynthesizer", "TimeGANSynthesizer"],
    }


@app.post("/v1/tabular/generate")
def generate_tabular(body: TabularGenerateRequest):
    if len(body.rows) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 rows to fit tabular synthesizer")
    synth = TabularGMMSynthesizer(
        n_components=body.n_components,
        numeric_columns=body.numeric_columns,
        row_id_column=body.row_id_column,
    )
    synth.fit(body.rows)
    samples = synth.sample(body.n_samples)
    return {
        "method": "TabularGMMSynthesizer",
        "n_samples": len(samples),
        "numeric_columns": body.numeric_columns,
        "rows": samples,
    }


@app.post("/v1/sequence/generate")
def generate_sequence(body: SequenceGenerateRequest):
    synth = TimeSeriesLSTMSynthesizer(
        hidden_dim=body.hidden_dim,
        epochs=body.epochs,
        numeric_columns=body.numeric_columns,
    )
    synth.fit(body.history)
    steps = synth.sample(body.n_steps)
    return {
        "method": "TimeSeriesLSTMSynthesizer",
        "n_steps": len(steps),
        "numeric_columns": body.numeric_columns,
        "history": steps,
    }


@app.post("/v1/validate")
def validate(body: ValidateRequest):
    report = validate_fidelity(
        real_data=body.real_rows,
        synthetic_data=body.synthetic_rows,
        metrics=body.numeric_columns,
        ks_threshold=body.ks_threshold,
        js_threshold=body.js_threshold,
        tvd_threshold=body.tvd_threshold,
        pass_rate_threshold=body.pass_rate_threshold,
    )
    return report


@app.post("/v1/tabular/pipeline")
def tabular_pipeline(body: TabularPipelineRequest):
    """Generate synthetic tabular rows and run fidelity validation in one request."""
    if len(body.rows) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 rows to fit tabular synthesizer")

    synth = TabularGMMSynthesizer(
        n_components=body.n_components,
        numeric_columns=body.numeric_columns,
        row_id_column=body.row_id_column,
    )
    synth.fit(body.rows)
    samples = synth.sample(body.n_samples)
    report = validate_fidelity(
        real_data=body.rows,
        synthetic_data=samples,
        metrics=body.numeric_columns,
        ks_threshold=body.ks_threshold,
        js_threshold=body.js_threshold,
        tvd_threshold=body.tvd_threshold,
        pass_rate_threshold=body.pass_rate_threshold,
    )
    return {
        "method": "TabularGMMSynthesizer",
        "n_samples": len(samples),
        "numeric_columns": body.numeric_columns,
        "rows": samples,
        "validation_report": report,
    }
