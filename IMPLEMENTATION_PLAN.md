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

## Remaining Backlog

| Priority | Item | Status |
|----------|------|--------|
| P1 | `get_db()` slow-fail on index provisioning | ✅ Completed |
| P2 | `orchestration/` runtime JSON artifacts committed to git | ✅ Completed |
| P2 | Review Board (`orchestrator/`) not wired into compose/k8s/CI | Open |
| P3 | Docker-in-docker deployment privilege surface | Open |
