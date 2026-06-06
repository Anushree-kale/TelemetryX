import auth


def test_bootstrap_api_key_lookup(monkeypatch):
    monkeypatch.setenv("TELEMETRYX_API_KEYS", "team-alpha-key,team-beta-key")
    assert auth.lookup_api_key("team-alpha-key") is not None
    assert auth.lookup_api_key("team-beta-key") is not None
    assert auth.lookup_api_key("invalid") is None


def test_auth_disabled_in_dev_without_keys(monkeypatch):
    monkeypatch.delenv("TELEMETRYX_API_KEYS", raising=False)
    monkeypatch.setenv("TELEMETRYX_ENV", "development")
    monkeypatch.delenv("AUTH_DISABLED", raising=False)
    assert auth.auth_disabled() is True


def test_auth_required_in_production(monkeypatch):
    monkeypatch.setenv("TELEMETRYX_ENV", "production")
    monkeypatch.delenv("AUTH_DISABLED", raising=False)
    monkeypatch.delenv("TELEMETRYX_API_KEYS", raising=False)
    assert auth.auth_disabled() is False


def test_health_is_public(api_client):
    response = api_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_analyze_without_key_when_auth_disabled(api_client, monkeypatch):
    monkeypatch.setattr("tasks.analyze_repo_task.delay", lambda *args, **kwargs: None)
    response = api_client.post(
        "/analyze",
        json={"repo_url": "https://github.com/octocat/Hello-World"},
    )
    assert response.status_code == 200
    assert "job_id" in response.json()


def test_analyze_rejects_missing_key_when_auth_enabled(api_client, monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "0")
    monkeypatch.setenv("TELEMETRYX_API_KEYS", "ci-test-key")

    import importlib
    import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as client:
        response = client.post(
            "/analyze",
            json={"repo_url": "https://github.com/octocat/Hello-World"},
        )
        assert response.status_code == 401

        monkeypatch.setattr("tasks.analyze_repo_task.delay", lambda *args, **kwargs: None)
        ok = client.post(
            "/analyze",
            json={"repo_url": "https://github.com/octocat/Hello-World"},
            headers={"X-API-Key": "ci-test-key"},
        )
        assert ok.status_code == 200
