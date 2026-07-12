"""GitHub OAuth2 helpers — exchange code for token, fetch user profile."""

from __future__ import annotations

import os
import httpx

GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


def get_client_id() -> str:
    val = os.getenv("GITHUB_OAUTH_CLIENT_ID", "").strip()
    if not val:
        raise RuntimeError("GITHUB_OAUTH_CLIENT_ID is not set")
    return val

def get_client_secret() -> str:
    val = os.getenv("GITHUB_OAUTH_CLIENT_SECRET", "").strip()
    if not val:
        raise RuntimeError("GITHUB_OAUTH_CLIENT_SECRET is not set")
    return val


def get_callback_url() -> str:
    return os.getenv("GITHUB_CALLBACK_URL", "http://localhost:3000/auth/callback")


def build_authorize_url(state: str = "") -> str:
    """Return the GitHub OAuth authorize URL to redirect the browser to."""
    base = "https://github.com/login/oauth/authorize"
    params = f"client_id={get_client_id()}&scope=read:user,user:email"
    if state:
        params += f"&state={state}"
    return f"{base}?{params}"


def exchange_code_for_token(code: str) -> str:
    """Exchange a one-time code for a GitHub access token. Returns the token string."""
    response = httpx.post(
        GITHUB_TOKEN_URL,
        headers={"Accept": "application/json"},
        data={
            "client_id": get_client_id(),
            "client_secret": get_client_secret(),
            "code": code,
        },
        timeout=10.0,
    )
    response.raise_for_status()
    data = response.json()
    token = data.get("access_token", "")
    if not token:
        error = data.get("error_description") or data.get("error") or "unknown error"
        raise ValueError(f"GitHub token exchange failed: {error}")
    return token


def fetch_github_user(access_token: str) -> dict:
    """Fetch the authenticated user's profile from GitHub."""
    response = httpx.get(
        GITHUB_USER_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
        },
        timeout=10.0,
    )
    response.raise_for_status()
    return response.json()
