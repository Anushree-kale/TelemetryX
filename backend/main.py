from contextlib import asynccontextmanager
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

import database
from debt_model import get_scorer
from tasks import analyze_repo_task


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.init_schema()
    scorer = get_scorer()
    scorer.load()
    yield


app = FastAPI(title="TelemetryX", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_repo_endpoint(body: AnalyzeRequest):
    repo_url = str(body.repo_url)
    job_id = database.create_job(repo_url)
    analyze_repo_task.delay(job_id, repo_url)
    return AnalyzeResponse(job_id=job_id, status="pending")


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
        "modules": modules,
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


@app.get("/results/{job_id}/graph")
def get_dependency_graph(job_id: int):
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    modules = database.get_job_modules(job_id)

    # Map of lowercased file stem to full relative file_path
    stem_map = {}
    for m in modules:
        file_path = m["file_path"]
        stem = Path(file_path).stem.lower()
        stem_map[stem] = file_path

    nodes = []
    links = []

    for m in modules:
        nodes.append({
            "id": m["file_path"],
            "name": Path(m["file_path"]).name,
            "loc": m["lines_of_code"],
            "debt_score": m["debt_score"],
            "risk_level": m["risk_level"] or "low"
        })

        imports_str = m.get("imports") or ""
        if imports_str:
            import_tokens = [i.strip().lower() for i in imports_str.split(",") if i.strip()]
            for token in import_tokens:
                if token in stem_map:
                    target_path = stem_map[token]
                    if target_path != m["file_path"]:  # Skip self loops
                        links.append({
                            "source": m["file_path"],
                            "target": target_path
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
