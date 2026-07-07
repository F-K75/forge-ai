FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git curl docker.io \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Single worker: builds run as in-process tasks and stream events through the
# in-memory WS ConnectionManager, which does not fan out across workers.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
