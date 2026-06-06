import numpy as np
import pytest

from privacy import dp_engine
from privacy import gan_engine, synthesis_engine


def test_pii_stripping_and_anonymization():
    t1 = 1767225600
    t2 = 1767312000

    anonymized = dp_engine.strip_pii_and_anonymize([t1, t2])
    assert len(anonymized) == 2
    assert anonymized[0] == 1766966400
    assert anonymized[1] == 1766966400


def test_k_anonymity_contributor_data():
    metrics = [
        {
            "file_path": "src/module_a.py",
            "unique_author_count": 1,
            "top_author_pct": 0.9,
            "lines_of_code": 150,
        },
        {
            "file_path": "src/module_b.py",
            "unique_author_count": 5,
            "top_author_pct": 0.4,
            "lines_of_code": 500,
        },
    ]

    perturbed = dp_engine.perturb_metrics(metrics, epsilon=1.0, delta=1e-5, k=3)
    assert len(perturbed) == 2
    # Below k: contributor fields are redacted (not just noised).
    assert perturbed[0]["unique_author_count"] == 0
    assert perturbed[0]["top_author_pct"] == 0.0
    # At or above k: contributor count is not k-redacted (DP may still perturb/clamp values).
    assert perturbed[1]["unique_author_count"] >= 1
    assert "top_author_pct" in perturbed[1]


def test_tabular_gmm_synthesizer():
    data = [
        {"lines_of_code": 100, "cyclomatic_complexity": 5.0, "churn_90d": 2},
        {"lines_of_code": 200, "cyclomatic_complexity": 8.0, "churn_90d": 5},
        {"lines_of_code": 150, "cyclomatic_complexity": 6.0, "churn_90d": 3},
    ]
    synth = synthesis_engine.TabularGMMSynthesizer(
        n_components=2,
        numeric_columns=["lines_of_code", "cyclomatic_complexity", "churn_90d"],
    )
    synth.fit(data)
    samples = synth.sample(5)
    assert len(samples) == 5
    for row in samples:
        assert "lines_of_code" in row


def test_ctgan_tabular_synthesizer():
    data = [
        {"lines_of_code": 100, "cyclomatic_complexity": 5.0},
        {"lines_of_code": 200, "cyclomatic_complexity": 8.0},
        {"lines_of_code": 150, "cyclomatic_complexity": 6.0},
    ]
    with pytest.warns(DeprecationWarning):
        ctgan = gan_engine.CTGANSynthesizer(n_components=2)
    ctgan.fit(data)
    samples = ctgan.sample(3)
    assert len(samples) == 3


@pytest.mark.slow
def test_time_series_lstm_synthesizer():
    history = [
        {
            "total_loc": 1000 + i * 10,
            "avg_debt_score": 40 + i,
            "avg_test_coverage": 0.4 + i * 0.01,
            "high_risk_count": i,
            "file_count": 20 + i,
            "burnout_score": 0.15 + i * 0.01,
        }
        for i in range(12)
    ]
    synth = synthesis_engine.TimeSeriesLSTMSynthesizer(epochs=5)
    synth.fit(history)
    steps = synth.sample(3)
    assert len(steps) == 3
    for step in steps:
        assert "total_loc" in step


@pytest.mark.slow
def test_timegan_time_series_synthesizer():
    history = [
        {
            "total_loc": 1000 + i * 10,
            "avg_debt_score": 40 + i,
            "avg_test_coverage": 0.4 + i * 0.01,
            "high_risk_count": i,
            "file_count": 20 + i,
            "burnout_score": 0.15 + i * 0.01,
        }
        for i in range(12)
    ]
    with pytest.warns(DeprecationWarning):
        timegan = gan_engine.TimeGANSynthesizer(epochs=5)
    timegan.fit(history)
    steps = timegan.sample(3)
    assert len(steps) == 3


def test_fidelity_validation_gate():
    real = [{"lines_of_code": 100 + i * 10, "churn_90d": i} for i in range(20)]
    synthetic = [{"lines_of_code": 105 + i * 10, "churn_90d": i} for i in range(20)]
    report = gan_engine.validate_fidelity(real, synthetic, metrics=["lines_of_code", "churn_90d"])
    assert "passed" in report
    assert "per_metric" in report
