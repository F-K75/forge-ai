# Fix: Missing celery-worker Healthcheck in docker-compose.yml (DEV-004, P0)

## Problem

The `celery-worker` service in `docker-compose.yml` (development Compose file)
has **no `healthcheck` block**, while every other service (`backend`, `frontend`,
`mongo`, `redis`) defines one. This is the single production-readiness gap for
DevOps / deployment infrastructure.

Consequences:
- `depends_on` for mongo/redis uses `condition: service_healthy`, so the
  celery-worker will start as soon as the Docker engine creates the container
  — it does **not** wait for Mongo or Redis to be ready.
- A celery-worker that starts before its broker (Redis) is accepting connections
  will crash-loop with `ConnectionError` until Redis becomes healthy, generating
  noise in logs and potentially masking real issues.
- Operators running `docker compose ps` cannot see whether the worker is actually
  processing tasks or stuck in a reconnect loop.
- The prod Compose file (`docker-compose.prod.yml`) already has a working
  healthcheck on the `worker` service; only the dev file is incomplete.

## Root Cause

`docker-compose.yml` lines 40–66 define `celery-worker` with `depends_on` but no
`healthcheck`. This was an oversight during initial Compose scaffolding — the
backend and frontend services got healthchecks, the infrastructure services
(mongo, redis) got them, but the worker was missed.

## Solution

Add a `healthcheck` block to `celery-worker` in `docker-compose.yml` that:

1. Uses `celery -A celery_app inspect ping` to verify the worker is alive and
   connected to the broker.
2. Uses `CMD-SHELL` form so `$$HOSTNAME` is correctly expanded by the shell
   (same pattern already used in `docker-compose.prod.yml` worker service).
3. Sets `interval: 60s`, `timeout: 15s`, `retries: 3`, `start_period: 30s` —
   matching the prod worker's values exactly for consistency.

No other changes are needed: the existing `depends_on` already uses
`condition: service_healthy`, so adding the healthcheck immediately makes that
gate functional.

## Architecture Changes

None — this is an infrastructure-only fix.

## Database Changes

None.

## API Changes

None.

## UI Changes

None.

## Testing Strategy

- Static: `docker compose config` validates YAML syntax and interpolation.
- Functional: `docker compose up --build` — `docker compose ps` shows
  `(healthy)` for all five services after start_period elapses.
- Resilience: `docker compose stop mongo` confirms celery-worker transitions
  to `unhealthy` rather than staying `healthy` while disconnected.
- No code-level unit tests are needed; the healthcheck command is a deployment
  manifest concern, not application logic.

## Risks

- **Very low**: The healthcheck command (`celery inspect ping`) is the same
  command already used in production (`docker-compose.prod.yml` worker service,
  line 133). It is a no-op for a worker that is not yet connected — it returns
  a non-zero exit code, which is the correct signal for "not healthy yet".
- **Very low**: `start_period: 30s` matches the prod value; the worker image
  already takes ~10–15s to initialize (import + broker connect), so 30s is
  sufficient and consistent.
- **Very low**: `$$HOSTNAME` in `CMD-SHELL` is expanded by `/bin/sh -c` inside
  the container to the container's actual hostname, which is the worker name
  that Celery uses for its `@hostname` routing. This is the same pattern used
  in the prod worker.

## Rollback Plan

Revert the single `healthcheck:` block added to `celery-worker` in
`docker-compose.yml`. The service returns to its prior behaviour (no health
signal, but still functional).
