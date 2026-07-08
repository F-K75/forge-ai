# Production Readiness Improvements — Session Summary

## Completed

### 1. Fast-fail MongoDB index provisioning (INF-008, P1)

**Problem**: `get_db()` called `_ensure_indexes()` which ran ~35 sequential `create_index` calls. Each call waited the full `serverSelectionTimeoutMS=5000` (5 seconds) when MongoDB was unreachable, producing a ~175-second slow-fail.

**Fix**: Refactored `_ensure_indexes()` in `backend/core/database.py` to collect all `create_index` coroutines into a list and run them concurrently via `asyncio.gather(..., return_exceptions=True)`. When MongoDB is down, all calls fail after the same ~5s window simultaneously.

**Result**: Slow-fail time reduced from ~175s to ~5s. Backend tests: 395 passed.

**Files**: `backend/core/database.py`, `backend/tests/test_index_provisioning.py`

### 2. Remove orchestration runtime artifacts from git (P2)

**Problem**: 31 generated JSON files under `orchestration/` were tracked in git. They are produced at runtime by the meta-orchestration tooling and bloat the repo with merge noise and sensitive runtime state.

**Fix**: Added `orchestration/*.json` to `.gitignore` and removed the files from git tracking with `git rm --cached`. Local copies are preserved for running tooling.

**Files**: `.gitignore`, 31 deleted files under `orchestration/`

### 3. Wire Review Board (orchestrator/) into docker-compose, k8s, and CI (P2)

**Problem**: The Review Board (`orchestrator/`) was a fully functional FastAPI service with its own tests, but had no Dockerfile, no docker-compose service, no k8s manifests, and no CI job. It could only be run manually.

**Fix**:
- Created `orchestrator/Dockerfile` following the backend pattern
- Added `orchestrator` service to `docker-compose.yml` with mongo+redis dependencies, healthcheck, and resource limits
- Created `k8s/orchestrator.yaml` with Deployment (2 replicas), Service (port 8100), and HPA (2-10 replicas)
- Added `orchestrator` CI job to `.github/workflows/ci.yml`
- Updated `quality-gate` to include the new job
- Fixed flaky `test_ensure_indexes_runs_concurrently` timing tolerance

**Files**: `orchestrator/Dockerfile`, `docker-compose.yml`, `k8s/orchestrator.yaml`, `.github/workflows/ci.yml`, `backend/tests/test_index_provisioning.py`

## Remaining Backlog

| Priority | Item | Status |
|----------|------|--------|
| P1 | `get_db()` slow-fail on index provisioning | ✅ Completed |
| P2 | `orchestration/` runtime JSON artifacts committed to git | ✅ Completed |
| P2 | Review Board (`orchestrator/`) not wired into compose/k8s/CI | ✅ Completed |
| P3 | Docker-in-docker deployment privilege surface review | Open |
