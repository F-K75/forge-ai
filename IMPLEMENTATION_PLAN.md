# Wire Review Board (orchestrator/) into docker-compose, k8s, and CI

## Problem

The Review Board (`orchestrator/`) is a fully functional FastAPI service with:
- REST API + WebSocket on port 8100
- Agent loader, context builder, parallel runner, consolidator
- MongoDB persistence layer
- Offline pytest suite (`orchestrator/tests/test_orchestrator.py`)

But it is **not wired into any deployment or CI pipeline**:
- `docker-compose.yml` has a comment: "run manually for now"
- No k8s Deployment/Service/HPA
- No CI job to build, test, or lint it
- No Dockerfile

This means the service cannot be deployed, monitored, or validated automatically.

## Root Cause

The orchestrator was built as a standalone module with its own `requirements.txt`, `tests/`, and `README.md`, but no containerization or pipeline integration was ever added.

## Solution

1. **Dockerfile**: Create `orchestrator/Dockerfile` following the backend pattern (Python 3.12-slim, uvicorn, HEALTHCHECK)
2. **docker-compose.yml**: Add `orchestrator` service with env vars, healthcheck, depends_on mongo+redis
3. **k8s/orchestrator.yaml**: Create Deployment (2 replicas), Service (ClusterIP on 8100), HPA (2-10 replicas)
4. **CI**: Add `orchestrator` job to `.github/workflows/ci.yml` that installs deps and runs `pytest orchestrator/tests -q`
5. **Tests**: Verify `orchestrator/tests/test_orchestrator.py` passes (offline, no MongoDB needed)

## Architecture Changes

- New container: `orchestrator` (FastAPI on port 8100)
- Shares MongoDB (`forge_review` database) and Redis with backend
- Frontend already has `VITE_ORCHESTRATOR_URL=http://localhost:8100` env var

## Database Changes

- None. The orchestrator uses its own MongoDB database (`forge_review`) which it creates on first run.

## API Changes

- None. The orchestrator API is unchanged.

## UI Changes

- None. The frontend already has the `VITE_ORCHESTRATOR_URL` env var configured.

## Testing Strategy

- Unit: `pytest orchestrator/tests -q` (offline, no MongoDB)
- Integration: `docker compose up orchestrator` + healthcheck
- CI: new job runs tests on every PR

## Risks

- **Very low**: The orchestrator is a standalone service with no shared code with the backend API. Adding it to compose/k8s/CI is purely additive.
- **Low**: The orchestrator needs its own MongoDB database (`forge_review`). In docker-compose, it shares the same mongo container. In k8s, it uses the same MongoDB StatefulSet. The database is created on first run.

## Rollback Plan

- Remove the `orchestrator` service from `docker-compose.yml` and delete `orchestrator/Dockerfile`
- Delete `k8s/orchestrator.yaml`
- Revert `.github/workflows/ci.yml` to remove the `orchestrator` job
