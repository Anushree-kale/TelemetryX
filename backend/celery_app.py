import os
import sys
from pathlib import Path

# Add backend directory to path to prevent ModuleNotFoundError
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from celery import Celery
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "telemetryx",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["tasks"],
)

celery_app.conf.update(
    task_track_started=True,
    result_extended=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    broker_transport_options={
        # Must exceed longest analyze task; prevents Redis from re-delivering
        # a still-running task after the default 1h visibility window.
        "visibility_timeout": int(os.getenv("CELERY_VISIBILITY_TIMEOUT", "14400")),
    },
)
