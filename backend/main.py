from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, RedirectResponse, JSONResponse
from pydantic import BaseModel, HttpUrl

import analyzer
import auth
import config
import database
import export as job_export
import post_analysis
import oauth as oauth_service
import jwt_service
from debt_model import MODEL_PATH, get_scorer
from explain import reasons_to_text
from graph_builder import graph_from_stored_json
from tasks import analyze_repo_task


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.require_admin_key_at_startup()
    database.init_schema()
    config.require_api_keys_at_startup()
    scorer = get_scorer()
    scorer.load()
    yield


app = FastAPI(title="TelemetryX", version="0.2.0", lifespan=lifespan)

_default_cors = ["http://localhost:3000", "http://localhost:5173"]
# Comma-separated extra origins, e.g. CORS_ALLOW_ORIGINS=https://app.example.com,https://staging.example.com
_extra_origins = [
    o.strip()
    for o in os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
    if o.strip()
]
_cors_allow = list(dict.fromkeys(_default_cors + _extra_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(auth.ApiKeyMiddleware)


class AnalyzeRequest(BaseModel):
    repo_url: HttpUrl


class AnalyzeResponse(BaseModel):
    job_id: int
    status: str


class JobStatusResponse(BaseModel):
    job_id: int
    status: str
    progress_pct: int
    progress_message: str
    error_detail: str | None = None


class ApiKeyCreateRequest(BaseModel):
    name: str
    team: str = "default"
    rate_limit_per_hour: int = 100


# ── GitHub OAuth2 ────────────────────────────────────────────────────────────

@app.get("/oauth/github")
def github_oauth_start():
    """Redirect the browser to GitHub's OAuth authorization page."""
    url = oauth_service.build_authorize_url()
    return RedirectResponse(url=url, status_code=302)


@app.get("/oauth/github/callback")
def github_oauth_callback(code: str | None = None, error: str | None = None):
    """Receive GitHub's redirect with one-time code, exchange for JWT, set cookie."""
    import logging
    logger = logging.getLogger(__name__)

    callback_url = os.getenv("GITHUB_CALLBACK_URL", "http://localhost:3000/auth/callback")
    # Derive frontend root from callback URL
    frontend_root = callback_url.rsplit("/auth/callback", 1)[0]

    if error or not code:
        return RedirectResponse(
            url=f"{frontend_root}/login?error=github_denied",
            status_code=302,
        )

    try:
        access_token = oauth_service.exchange_code_for_token(code)
        gh_user = oauth_service.fetch_github_user(access_token)
    except Exception as exc:
        logger.error("GitHub OAuth error: %s", exc)
        return RedirectResponse(
            url=f"{frontend_root}/login?error=github_failed",
            status_code=302,
        )

    # Persist / update user in DB
    db_user = database.upsert_user(
        github_id=str(gh_user.get("id", "")),
        login=gh_user.get("login", ""),
        name=gh_user.get("name") or gh_user.get("login", ""),
        email=gh_user.get("email") or "",
        avatar_url=gh_user.get("avatar_url", ""),
        provider="github",
    )

    # Mint JWT
    payload = jwt_service.token_payload_from_github_user(gh_user)
    payload["db_id"] = db_user["id"]
    token = jwt_service.create_access_token(payload)

    # Redirect to frontend callback route with HTTP-only JWT cookie
    response = RedirectResponse(url=callback_url, status_code=302)
    response.set_cookie(
        key=jwt_service.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/",
    )
    return response


@app.get("/auth/me")
def get_current_user(request: Request):
    """Return the currently logged-in user decoded from the JWT cookie."""
    token = request.cookies.get(jwt_service.COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = jwt_service.decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {
        "id": payload.get("db_id"),
        "login": payload.get("login"),
        "name": payload.get("name"),
        "avatar_url": payload.get("avatar_url"),
        "email": payload.get("email"),
        "provider": payload.get("provider"),
    }


@app.post("/auth/logout")
def logout():
    """Clear the JWT cookie to log the user out."""
    response = JSONResponse(content={"status": "ok", "message": "Logged out"})
    response.delete_cookie(key=jwt_service.COOKIE_NAME, path="/")
    return response


# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "telemetryx-api", "auth_required": not auth.auth_disabled()}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_repo_endpoint(body: AnalyzeRequest):
    repo_url = str(body.repo_url)
    job_id = database.create_job(repo_url)
    analyze_repo_task.delay(job_id, repo_url)
    return AnalyzeResponse(job_id=job_id, status="pending")


@app.get("/jobs/latest")
def get_latest_job():
    job = database.get_latest_completed_job()
    if not job:
        return {"job_id": None, "status": "empty"}
    return {
        "job_id": job["id"],
        "repo_url": job["repo_url"],
        "status": job["status"],
        "created_at": job["created_at"].isoformat() if job["created_at"] else None,
        "privacy_mode": job.get("privacy_mode", False),
    }


@app.get("/jobs/{job_id}/status", response_model=JobStatusResponse)
def get_job_status(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job["id"],
        status=job["status"],
        progress_pct=job.get("progress_pct") or 0,
        progress_message=job.get("progress_message") or "",
        error_detail=job.get("error_detail"),
    )


@app.get("/jobs/{job_id}/export")
def export_job_results(job_id: int, format: str = "csv", limit: int = 5000):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "complete":
        raise HTTPException(status_code=400, detail="Job analysis is not complete yet")

    limit = max(1, min(limit, 50_000))
    modules = database.get_job_modules(job_id)
    fmt = format.lower().strip()

    if fmt == "csv":
        body = job_export.build_csv(modules, limit)
        media_type = "text/csv; charset=utf-8"
        filename = f"job_{job_id}_export.csv"
    elif fmt == "pdf":
        body = job_export.build_pdf(job, modules, limit)
        media_type = "application/pdf"
        filename = f"job_{job_id}_export.pdf"
    else:
        raise HTTPException(status_code=400, detail="format must be csv or pdf")

    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/results/{job_id}")
def get_results(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    modules = database.get_job_modules(job_id)
    return {
        "job_id": job["id"],
        "repo_url": job["repo_url"],
        "status": job["status"],
        "progress_pct": job.get("progress_pct") or 0,
        "progress_message": job.get("progress_message") or "",
        "error_detail": job.get("error_detail"),
        "created_at": job["created_at"].isoformat() if job["created_at"] else None,
        "privacy_mode": job.get("privacy_mode", False),
        "modules": modules,
    }


@app.get("/modules")
def list_modules():
    return {"modules": database.get_all_modules()}


def get_admin_key(x_admin_key: str = Header(None)):
    expected_key = config.get_expected_admin_key()
    if not x_admin_key or x_admin_key != expected_key:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid X-Admin-Key")
    return x_admin_key


@app.post("/model/retrain")
def retrain_model(admin_key: str = Depends(get_admin_key)):
    rows = database.get_all_metrics_for_training()
    if len(rows) < 3:
        raise HTTPException(
            status_code=400,
            detail="Need at least 3 analyzed modules in the database to retrain",
        )
    scorer = get_scorer()
    scorer.train(rows)
    return {
        "status": "ok",
        "message": f"Model retrained on {len(rows)} modules",
        "model_path": str(scorer.model is not None),
    }


@app.post("/admin/api-keys")
def create_api_key(body: ApiKeyCreateRequest, admin_key: str = Depends(get_admin_key)):
    plaintext = auth.generate_api_key()
    record = database.create_api_key_record(
        name=body.name.strip(),
        team=body.team.strip() or "default",
        key_hash=auth.hash_api_key(plaintext),
        key_prefix=auth.key_prefix(plaintext),
        rate_limit_per_hour=max(1, body.rate_limit_per_hour),
    )
    return {
        "status": "ok",
        "api_key": plaintext,
        "message": "Store this key securely — it will not be shown again.",
        "record": record,
    }


@app.get("/admin/api-keys")
def list_api_keys(admin_key: str = Depends(get_admin_key)):
    return {"keys": database.list_api_keys()}


@app.delete("/admin/api-keys/{key_id}")
def revoke_api_key(key_id: int, admin_key: str = Depends(get_admin_key)):
    if not database.revoke_api_key(key_id):
        raise HTTPException(status_code=404, detail="API key not found or already revoked")
    return {"status": "ok", "revoked_id": key_id}


@app.get("/jobs/history")
def get_jobs_history(repo_url: str):
    return database.get_repo_jobs_history(repo_url)


@app.get("/analyzer/languages")
def get_analyzer_languages():
    """Language coverage for repository analysis (enterprise: Python, JS/TS, Java, Go)."""
    return analyzer.supported_languages_summary()


@app.get("/jobs/{job_id}/co-changes")
def get_job_co_changes(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    pairs = database.get_co_change_pairs(job_id)
    return {"job_id": job_id, "pairs": pairs, "pair_count": len(pairs)}


@app.get("/jobs/{job_id}/modules/{module_id}/risk-explanation")
def get_module_risk_explanation(job_id: int, module_id: int):
    """Unified per-file 'why is this risky' response (debt model + code-grounded text)."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    module = database.get_job_module(job_id, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found in this job")

    drivers = module.get("reasons", [])
    return {
        "job_id": job_id,
        "module_id": module_id,
        "file_path": module["file_path"],
        "debt_score": module.get("debt_score"),
        "risk_level": module.get("risk_level"),
        "drivers": drivers,
        "explanation": reasons_to_text(drivers, module),
        "job_drivers": database.get_job_shap_aggregate(job_id),
    }


@app.get("/model/status")
def get_model_status():
    scorer = get_scorer()
    training_rows = database.get_all_metrics_for_training()
    return {
        "model_loaded": scorer.model is not None,
        "model_file_exists": MODEL_PATH.exists(),
        "training_sample_count": len(training_rows),
    }


@app.get("/roadmap/{job_id}")
def get_roadmap(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    items = database.get_roadmap_items(job_id)
    return {"job_id": job_id, "items": items}


@app.get("/graph/{job_id}")
def get_graph(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stored = database.get_dependency_graph(job_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Graph not found for this job")

    modules = database.get_job_modules(job_id)
    mod_by_path = {m["file_path"]: m for m in modules}
    graph_json = stored["graph_json"]

    enriched_nodes = []
    for node in graph_json.get("nodes", []):
        fp = node.get("id")
        m = mod_by_path.get(fp, {})
        enriched_nodes.append({
            **node,
            "debt_score": m.get("debt_score"),
            "priority_score": m.get("priority_score"),
            "cluster_id": m.get("cluster_id", 0),
            "in_degree": m.get("in_degree", 0),
            "is_critical": bool(m.get("is_critical")),
            "risk_level": m.get("risk_level", "low"),
        })

    return {
        "job_id": job_id,
        "graph_json": {**graph_json, "nodes": enriched_nodes},
        "node_count": stored["node_count"],
        "edge_count": stored["edge_count"],
        "cluster_count": stored["cluster_count"],
    }


@app.get("/graph/{job_id}/node/{file_path:path}")
def get_graph_node(job_id: int, file_path: str):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    decoded_path = unquote(file_path)
    stored = database.get_dependency_graph(job_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Graph not found for this job")

    modules = database.get_job_modules(job_id)
    module = next((m for m in modules if m["file_path"] == decoded_path), None)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found in graph")

    G = graph_from_stored_json(stored["graph_json"])
    predecessors = list(G.predecessors(decoded_path)) if decoded_path in G else []
    successors = list(G.successors(decoded_path)) if decoded_path in G else []

    return {
        "file_path": decoded_path,
        "debt_score": module.get("debt_score"),
        "priority_score": module.get("priority_score"),
        "in_degree": module.get("in_degree", 0),
        "out_degree": module.get("out_degree", 0),
        "downstream_count": module.get("downstream_count", 0),
        "betweenness": module.get("betweenness", 0),
        "cluster_id": module.get("cluster_id", 0),
        "is_critical": bool(module.get("is_critical")),
        "importers": predecessors,
        "importees": successors,
    }


class CriticalToggle(BaseModel):
    is_critical: bool


@app.patch("/modules/{module_id}/critical")
def toggle_module_critical(module_id: int, body: CriticalToggle):
    result = database.set_module_critical(module_id, body.is_critical)
    if not result:
        raise HTTPException(status_code=404, detail="Module not found")

    job_id = result["job_id"]
    post_analysis.run_post_analysis(job_id)
    items = database.get_roadmap_items(job_id)
    return {"job_id": job_id, "items": items}


@app.get("/clusters/{job_id}")
def get_clusters(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    modules = database.get_job_modules(job_id)
    stored = database.get_dependency_graph(job_id)
    graph_json = stored["graph_json"] if stored else {"links": []}

    cross_cluster_edges = 0
    mod_cluster = {m["file_path"]: m.get("cluster_id", 0) for m in modules}
    for edge in graph_json.get("links", []):
        src = edge.get("source")
        tgt = edge.get("target")
        if isinstance(src, dict):
            src, tgt = src.get("id"), tgt.get("id") if isinstance(tgt, dict) else tgt
        if mod_cluster.get(src) != mod_cluster.get(tgt):
            cross_cluster_edges += 1

    clusters: dict[int, list] = {}
    for m in modules:
        cid = m.get("cluster_id", 0)
        clusters.setdefault(cid, []).append(m)

    result = []
    for cid, members in clusters.items():
        prefixes: dict[str, int] = {}
        for m in members:
            parts = m["file_path"].split("/")
            prefix = "/".join(parts[:-1]) if len(parts) > 1 else "(root)"
            prefixes[prefix] = prefixes.get(prefix, 0) + 1
        best_prefix = max(prefixes, key=prefixes.get) if prefixes else "(root)"
        avg_debt = sum(float(m.get("debt_score") or 0) for m in members) / len(members)
        top = max(members, key=lambda x: float(x.get("priority_score") or 0))
        result.append({
            "cluster_id": cid,
            "name": best_prefix,
            "file_count": len(members),
            "avg_debt_score": round(avg_debt, 2),
            "highest_priority_file": top["file_path"],
            "highest_priority_score": top.get("priority_score", 0),
            "cross_cluster_edge_count": cross_cluster_edges,
            "files": [m["file_path"] for m in members],
        })

    result.sort(key=lambda c: c["avg_debt_score"], reverse=True)
    return {"job_id": job_id, "clusters": result}


@app.get("/results/{job_id}/graph")
def get_dependency_graph_legacy(job_id: int):
    """Legacy endpoint — delegates to /graph/{job_id} node-link format."""
    data = get_graph(job_id)
    graph_json = data["graph_json"]
    links = []
    for edge in graph_json.get("links", []):
        links.append({
            "source": edge.get("source"),
            "target": edge.get("target"),
            "type": "coupling" if edge.get("type") == "co_change" else "import",
            "weight": edge.get("weight", 1),
        })
    nodes = []
    for node in graph_json.get("nodes", []):
        nodes.append({
            "id": node.get("id"),
            "name": Path(node.get("id", "")).name,
            "loc": node.get("lines_of_code"),
            "debt_score": node.get("debt_score"),
            "risk_level": node.get("risk_level", "low"),
            "priority_score": node.get("priority_score"),
            "cluster_id": node.get("cluster_id", 0),
            "in_degree": node.get("in_degree", 0),
            "is_critical": node.get("is_critical", False),
        })
    return {"nodes": nodes, "links": links}


@app.post("/webhook")
async def github_webhook(request: Request):
    body = await request.body()
    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "").strip()
    if secret:
        signature = request.headers.get("X-Hub-Signature-256", "")
        if not signature.startswith("sha256="):
            raise HTTPException(status_code=401, detail="Missing or invalid X-Hub-Signature-256")
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature[7:], expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    elif config.is_production():
        raise HTTPException(
            status_code=503,
            detail="GITHUB_WEBHOOK_SECRET must be set before exposing /webhook in production",
        )

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

    repo_info = payload.get("repository", {})
    clone_url = repo_info.get("clone_url")
    if not clone_url:
        raise HTTPException(status_code=400, detail="Missing repository clone_url in webhook payload")

    ref = payload.get("ref", "")
    if ref and "refs/heads/" in ref:
        branch = ref.replace("refs/heads/", "")
        if branch not in ("main", "master", "dev", "develop"):
            return {
                "status": "skipped",
                "message": f"Push to branch '{branch}' skipped. Only main/master/dev/develop branches auto-analyzed."
            }

    job_id = database.create_job(clone_url)
    analyze_repo_task.delay(job_id, clone_url)
    return {"status": "queued", "job_id": job_id, "repo_url": clone_url}


@app.get("/repos")
def get_repositories():
    return database.get_repo_urls_list()

