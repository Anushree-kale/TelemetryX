from contextlib import asynccontextmanager
import os
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, HttpUrl

import database
import export as job_export
import post_analysis
from debt_model import MODEL_PATH, get_scorer
from failure_predictor import load_failure_model
from graph_builder import graph_from_stored_json
from tasks import analyze_repo_task


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.init_schema()
    scorer = get_scorer()
    scorer.load()
    load_failure_model()
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


class AnalyzeRequest(BaseModel):
    repo_url: HttpUrl
    privacy_mode: bool = False


class AnalyzeResponse(BaseModel):
    job_id: int
    status: str
    privacy_mode: bool = False


class JobStatusResponse(BaseModel):
    job_id: int
    status: str
    progress_pct: int
    progress_message: str
    error_detail: str | None = None


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_repo_endpoint(body: AnalyzeRequest):
    repo_url = str(body.repo_url)
    job_id = database.create_job(repo_url, privacy_mode=body.privacy_mode)
    analyze_repo_task.delay(job_id, repo_url, privacy_mode=body.privacy_mode)
    return AnalyzeResponse(
        job_id=job_id,
        status="pending",
        privacy_mode=body.privacy_mode,
    )


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


@app.get("/jobs/{job_id}/burnout")
def get_burnout_assessment(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    assessment = database.get_burnout_assessment(job_id)
    if not assessment:
        return {"status": "pending", "job_id": job_id}

    return {
        "status": "complete",
        "job_id": job_id,
        "risk_level": assessment["risk_level"],
        "risk_score": assessment["risk_score"],
        "top_drivers": assessment["top_drivers"],
        "metrics": assessment["metrics"],
        "created_at": assessment["created_at"],
    }


@app.get("/modules")
def list_modules():
    return {"modules": database.get_all_modules()}


def get_admin_key(x_admin_key: str = Header(None)):
    expected_key = os.getenv("ADMIN_KEY", "telemetryx_secret_admin_key")
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


@app.get("/jobs/history")
def get_jobs_history(repo_url: str):
    return database.get_repo_jobs_history(repo_url)


@app.get("/jobs/{job_id}/co-changes")
def get_job_co_changes(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    pairs = database.get_co_change_pairs(job_id)
    return {"job_id": job_id, "pairs": pairs, "pair_count": len(pairs)}


@app.get("/jobs/{job_id}/shap-summary")
def get_job_shap_summary(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    rows = database.get_job_shap_aggregate(job_id)
    return {"job_id": job_id, "features": rows}


@app.get("/jobs/{job_id}/failure-risk")
def get_job_failure_risk(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    preds = database.get_job_failure_predictions(job_id)
    if not preds:
        return {
            "status": "pending",
            "job_id": job_id,
            "predictions": []
        }
    
    return {
        "status": "complete",
        "job_id": job_id,
        "predictions": preds
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
def github_webhook(payload: dict):
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


@app.get("/repos/compare")
def compare_repositories(repo_a: str, repo_b: str):
    repo_a = repo_a.strip()
    repo_b = repo_b.strip()

    if not repo_a or not repo_b:
        raise HTTPException(status_code=400, detail="Repository URLs cannot be empty")

    job_a = database.get_last_completed_job_for_repo(repo_a)
    job_b = database.get_last_completed_job_for_repo(repo_b)

    # Check for active pending or running jobs
    active_a = database.get_active_job_for_repo(repo_a)
    active_b = database.get_active_job_for_repo(repo_b)

    needs_trigger_a = not job_a and not active_a
    needs_trigger_b = not job_b and not active_b

    if needs_trigger_a:
        job_id_a = database.create_job(repo_a)
        analyze_repo_task.delay(job_id_a, repo_a)
        active_a = {
            "id": job_id_a,
            "status": "pending",
            "progress_pct": 0,
            "progress_message": "Queued comparison scan",
        }

    if needs_trigger_b:
        job_id_b = database.create_job(repo_b)
        analyze_repo_task.delay(job_id_b, repo_b)
        active_b = {
            "id": job_id_b,
            "status": "pending",
            "progress_pct": 0,
            "progress_message": "Queued comparison scan",
        }

    if not job_a or not job_b:
        status_a = "complete" if job_a else (active_a["status"] if active_a else "pending")
        progress_a = 100 if job_a else (active_a["progress_pct"] if active_a else 0)
        message_a = "Completed" if job_a else (active_a["progress_message"] if active_a else "Pending scan")

        status_b = "complete" if job_b else (active_b["status"] if active_b else "pending")
        progress_b = 100 if job_b else (active_b["progress_pct"] if active_b else 0)
        message_b = "Completed" if job_b else (active_b["progress_message"] if active_b else "Pending scan")

        return {
            "status": "scanning",
            "repo_a": {
                "url": repo_a,
                "status": status_a,
                "progress_pct": progress_a,
                "progress_message": message_a
            },
            "repo_b": {
                "url": repo_b,
                "status": status_b,
                "progress_pct": progress_b,
                "progress_message": message_b
            }
        }

    modules_a = database.get_job_modules(job_a["id"])
    modules_b = database.get_job_modules(job_b["id"])

    def calc_summary(modules):
        total_loc = sum(m.get("lines_of_code") or 0 for m in modules)
        high_risk = sum(1 for m in modules if m.get("risk_level") == "high")
        avg_debt = sum(m.get("debt_score") or 0 for m in modules) / len(modules) if modules else 0.0
        avg_coverage = sum(m.get("test_coverage_ratio") or 0.0 for m in modules) / len(modules) if modules else 0.0
        return {
            "total_loc": total_loc,
            "high_risk_count": high_risk,
            "avg_debt_score": round(avg_debt, 2),
            "avg_test_coverage": round(avg_coverage, 4),
            "file_count": len(modules)
        }

    summary_a = calc_summary(modules_a)
    summary_b = calc_summary(modules_b)

    return {
        "status": "complete",
        "repo_a": {
            "url": repo_a,
            "job_id": job_a["id"],
            "created_at": job_a["created_at"].isoformat() if job_a["created_at"] else None,
            "metrics": summary_a
        },
        "repo_b": {
            "url": repo_b,
            "job_id": job_b["id"],
            "created_at": job_b["created_at"].isoformat() if job_b["created_at"] else None,
            "metrics": summary_b
        }
    }


@app.get("/jobs/{job_id}/privacy-comparison")
def get_privacy_comparison(job_id: int):
    job = database.get_job(job_id)
    if not job or not job.get("privacy_mode"):
        return {"comparisons": []}
        
    repo_url = job["repo_url"]
    import redis_cache
    cached = redis_cache.get_cached_analysis(repo_url)
    if not cached:
        return {"comparisons": []}
        
    raw_modules = cached.get("modules", [])
    if not raw_modules:
        return {"comparisons": []}
        
    perturbed_modules = database.get_job_modules(job_id)
    if not perturbed_modules:
        return {"comparisons": []}
        
    # Find a module that has meaningful differences or just take the first
    p_mod = perturbed_modules[0]
    file_path = p_mod["file_path"]
    
    r_mod = next((m for m in raw_modules if m.get("file_path") == file_path), None)
    if not r_mod:
        return {"comparisons": []}
        
    comparisons = [
        {
            "metric": "Cyclomatic Complexity",
            "real": round(r_mod.get("cyclomatic_complexity", 0), 2),
            "transmitted": round(p_mod.get("cyclomatic_complexity", 0), 2)
        },
        {
            "metric": "Lines of Code",
            "real": r_mod.get("lines_of_code"),
            "transmitted": p_mod.get("lines_of_code")
        },
        {
            "metric": "Days Since Last Commit",
            "real": round(r_mod.get("days_since_last_commit", 0), 2),
            "transmitted": round(p_mod.get("days_since_last_commit", 0), 2)
        }
    ]
    return {"comparisons": comparisons}
