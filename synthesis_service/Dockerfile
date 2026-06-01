FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt /app/backend-requirements.txt
RUN pip install --no-cache-dir -r /app/backend-requirements.txt

COPY backend/privacy /app/backend/privacy
COPY synthesis_service/app.py /app/app.py

ENV PYTHONPATH=/app/backend:/app

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
