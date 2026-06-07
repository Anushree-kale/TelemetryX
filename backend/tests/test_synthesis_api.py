import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SYNTH_ROOT = Path(__file__).resolve().parents[2] / "synthesis_service"
if str(SYNTH_ROOT) not in sys.path:
    sys.path.insert(0, str(SYNTH_ROOT))


@pytest.fixture
def synthesis_client(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    import importlib

    import app as synthesis_app

    importlib.reload(synthesis_app)
    with TestClient(synthesis_app.app) as client:
        yield client


def test_synthesis_health(synthesis_client):
    response = synthesis_client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "telemetryx-synthesis"


def test_tabular_generate(synthesis_client):
    response = synthesis_client.post(
        "/v1/tabular/generate",
        json={
            "rows": [
                {"lines_of_code": 100, "churn_90d": 2},
                {"lines_of_code": 200, "churn_90d": 5},
                {"lines_of_code": 150, "churn_90d": 3},
            ],
            "numeric_columns": ["lines_of_code", "churn_90d"],
            "n_samples": 4,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["n_samples"] == 4
    assert len(body["rows"]) == 4


def test_validate_fidelity(synthesis_client):
    real_rows = [{"metric_a": float(i), "metric_b": float(i * 2)} for i in range(10)]
    synthetic_rows = [{"metric_a": float(i + 0.5), "metric_b": float(i * 2 + 1)} for i in range(10)]
    response = synthesis_client.post(
        "/v1/validate",
        json={
            "real_rows": real_rows,
            "synthetic_rows": synthetic_rows,
            "numeric_columns": ["metric_a", "metric_b"],
        },
    )
    assert response.status_code == 200
    assert "passed" in response.json()


def test_tabular_pipeline(synthesis_client):
    rows = [
        {"lines_of_code": 100, "churn_90d": 2},
        {"lines_of_code": 200, "churn_90d": 5},
        {"lines_of_code": 150, "churn_90d": 3},
    ]
    response = synthesis_client.post(
        "/v1/tabular/pipeline",
        json={
            "rows": rows,
            "numeric_columns": ["lines_of_code", "churn_90d"],
            "n_samples": 5,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["n_samples"] == 5
    assert "validation_report" in body
    assert "passed" in body["validation_report"]
