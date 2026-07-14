#!/bin/bash
# If the backend directory exists in the current folder, cd into it
if [ -d "backend" ]; then
  echo "Found backend directory, navigating into it..."
  cd backend
fi

# Print current directory and files for debugging
echo "Current directory:"
pwd
echo "Files in current directory:"
ls -la

# Start Celery worker in the background (concurrency 1 to save memory)
celery -A celery_app worker --loglevel=info --concurrency=1 &

# Start FastAPI web server
uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
