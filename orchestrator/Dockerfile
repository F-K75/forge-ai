FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "orchestrator.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1", "--proxy-headers"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8100/health || exit 1
