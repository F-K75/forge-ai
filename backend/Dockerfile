FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git curl bubblewrap \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Includes skills/<name>/SKILL.md (the Skill Engine catalogue, loaded at runtime);
# keep it out of .dockerignore. tests/test_skill_engine.py guards this.
COPY . .

RUN groupadd -r -g 1000 nonroot && useradd -r -g nonroot -u 1000 -m nonroot

USER nonroot

# Workers default to 4 (safe with Redis-backed WS pub/sub); override via
# UVICORN_WORKERS env var in compose/helm if needed.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-4} --proxy-headers"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
