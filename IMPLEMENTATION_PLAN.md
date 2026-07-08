# Fix: Reduce Docker-in-docker deployment privilege surface (P3)

## Problem

The backend Dockerfile installs `docker.io` (Docker CLI + daemon), and `backend/api/deployments.py` uses the Python `docker` SDK to build and run user-generated application containers. This creates a significant privilege surface:

1. **Unnecessary package**: `docker.io` is installed in the backend image but never used (the Python SDK communicates directly with the Docker daemon socket).
2. **No runtime guard**: If the Docker socket is accidentally mounted or the container is run privileged, the deployment code will execute without any warning.
3. **Documented but unprotected risk**: `DEPLOYMENT.md` notes the Docker socket is "deliberately not mounted in production" and the feature "stays dark," but there's no code-level enforcement.

## Root Cause

- `backend/Dockerfile` line 6: `apt-get install -y git curl docker.io` installs the Docker daemon/CLI unnecessarily.
- `backend/api/deployments.py`: uses `docker.from_env()` without checking if Docker access is explicitly enabled.
- No feature flag or environment variable gates the deployment functionality.

## Solution

1. **Remove `docker.io` from backend Dockerfile** — the Python SDK doesn't need the CLI package. This reduces the image size and attack surface.
2. **Add a runtime guard in `deployments.py`** — require `DEPLOYMENTS_ENABLED=true` environment variable before any Docker operations are attempted. If not set, return a clear error message.
3. **Document the security requirement** — add a prominent comment in the code explaining that the Docker socket must never be mounted in production without proper subdomain routing and isolation.

## Architecture Changes

- None. The deployment API endpoints remain, but they now require an explicit opt-in environment variable.

## Database Changes

- None.

## API Changes

- `POST /deployments/` returns `503 Service Unavailable` with a clear message when `DEPLOYMENTS_ENABLED` is not set.
- All other deployment endpoints behave the same.

## UI Changes

- None. The frontend should handle 503 gracefully (it already handles error responses).

## Testing Strategy

- Unit: verify deployment endpoints return 503 when `DEPLOYMENTS_ENABLED` is not set
- Unit: verify deployment endpoints work when `DEPLOYMENTS_ENABLED=true` and Docker is mocked
- Regression: run full backend test suite

## Risks

- **Very low**: Removing `docker.io` from the Dockerfile doesn't affect any existing functionality (the Python SDK doesn't need it). The runtime guard only affects the deployment feature which is already documented as "dark" in production.

## Rollback Plan

- Re-add `docker.io` to the Dockerfile
- Remove the `DEPLOYMENTS_ENABLED` guard from `deployments.py`
