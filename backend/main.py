from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
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


@app.post("/model/retrain")
def retrain_model():
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
