from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

import analyzer
import database


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.init_schema()
    yield


app = FastAPI(title="TelemetryX", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    repo_url: HttpUrl


class AnalyzeResponse(BaseModel):
    job_id: int
    status: str


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_repo_endpoint(body: AnalyzeRequest):
    repo_url = str(body.repo_url)
    job_id = database.create_job(repo_url)

    try:
        database.update_job_status(job_id, "running")
        metrics = analyzer.analyze_repo(repo_url)
        database.insert_module_metrics(job_id, metrics)
        database.update_job_status(job_id, "complete")
        return AnalyzeResponse(job_id=job_id, status="complete")
    except Exception as exc:
        database.update_job_status(job_id, "failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
        "created_at": job["created_at"].isoformat() if job["created_at"] else None,
        "modules": modules,
    }


@app.get("/modules")
def list_modules():
    return {"modules": database.get_all_modules()}
