FROM python:3.12-slim

WORKDIR /app

COPY synthesis_service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/privacy /app/backend/privacy
COPY synthesis_service/app.py /app/app.py

ENV PYTHONPATH=/app/backend:/app

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health')"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
