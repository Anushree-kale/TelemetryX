import burnout_model


def test_provenance_synthetic_by_default(monkeypatch):
    monkeypatch.setattr(burnout_model, "load_labeled_cohort_rows", lambda: None)
    monkeypatch.setattr(burnout_model, "_read_training_source", lambda: "synthetic")
    monkeypatch.setattr(burnout_model, "get_burnout_model", lambda: object())
    monkeypatch.setattr(burnout_model, "evaluate_on_validation", lambda clf: None)
    info = burnout_model.get_model_provenance(clf=object())
    assert info["credibility"] == "synthetic_only"
    assert "no real-world validation" in info["disclaimer"].lower()


def test_heuristic_score_range():
    score = burnout_model.heuristic_burnout_score(
        {
            "top_author_pct": 0.9,
            "bug_fix_ratio": 0.6,
            "days_since_last_commit": 50,
            "unique_author_count": 2,
        }
    )
    assert 0.0 <= score <= 1.0
    assert score > 0.5


def test_validated_credibility_when_metrics_present(monkeypatch):
    monkeypatch.setattr(
        burnout_model,
        "evaluate_on_validation",
        lambda clf: {"n_samples": 10, "accuracy": 0.8, "roc_auc": 0.85},
    )
    monkeypatch.setattr(burnout_model, "load_labeled_cohort_rows", lambda: [{"x": 1}] * 10)
    monkeypatch.setattr(burnout_model, "_read_training_source", lambda: "labeled_validation")
    monkeypatch.setattr(burnout_model, "get_burnout_model", lambda: object())

    info = burnout_model.get_model_provenance(clf=object())
    assert info["credibility"] == "validated"
