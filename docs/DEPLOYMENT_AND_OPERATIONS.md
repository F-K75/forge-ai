# Forge — Deployment & Operations

## How production is actually deployed

Production runs on a **single VPS via `docker-compose.prod.yml`**, driven by
`.github/workflows/deploy.yml`:

1. CI builds the backend and frontend images and pushes them to **GHCR**,
   tagged with the commit SHA.
2. The workflow copies `docker-compose.prod.yml` + `deploy/` to the VPS over
   SSH, persists the image tag, then runs
   `docker compose -f docker-compose.prod.yml pull && up -d --remove-orphans`.
3. **Rollback**: re-run the workflow manually with an earlier commit SHA as
   the image tag.

> **The `k8s/` manifests are NOT the live deploy path.** No workflow runs
> `kubectl apply`. They are a starting point for a future Kubernetes move and
> were last reconciled against real env vars on 2026-07-03. For production
> debugging, look at `deploy.yml` and `docker-compose.prod.yml`
> (see `k8s/README.md`).

### Production stack (`docker-compose.prod.yml`)

`nginx` (TLS termination, `deploy/nginx/templates`) · `backend` ·
`worker` (Celery) · `mongo` · `redis` · `certbot` (Let's Encrypt renewal;
bootstrap with `deploy/scripts/init-letsencrypt.sh`) · `backup` (scheduled
MongoDB backups).

## Local development

```bash
cp .env.example .env    # set ANTHROPIC_API_KEY, JWT_SECRET, MONGO_PASSWORD, REDIS_PASSWORD
./scripts/install-git-hooks.sh   # pre-commit secret scanning
docker compose up
```

Services: frontend :3000, backend :8000 (`/docs` for OpenAPI),
orchestrator :8100, mongo, redis, celery-worker. Non-Docker dev commands are
in the root `README.md`.

## CI (`.github/workflows/`)

- `ci.yml` — backend tests (450+, pytest), frontend tests (Vitest) + tsc +
  build, lint, pip-audit.
- `secret-scanning.yml` — repo secret scan (also enforced locally by the
  pre-commit hook).
- `deploy.yml` — build/push images + SSH deploy (above).

## Health & monitoring

| Endpoint | Use |
|---|---|
| `GET /health` | Liveness; returns 503 while draining during shutdown |
| `GET /health/detailed` | Readiness: Mongo + Redis + Celery workers; 503 when any check fails |
| `GET /health/pools` | Live Mongo/Redis connection-pool saturation |
| `GET /metrics` | Prometheus: HTTP request counts/latency, build metrics |

Grafana dashboards and a Prometheus setup exist under `k8s/`
(`monitoring.yaml`, `grafana-dashboards-configmap.yaml`) for the future k8s
path. Sentry is enabled by setting `SENTRY_DSN`.

Logs carry a request-correlation ID on every line
(`… INFO [<request_id>] logger: message`), so a single request can be traced
across middleware, routes, and services.

## Backups & disaster recovery

- `scripts/backup_mongodb.py` performs Mongo backups;
  `scripts/backup_verify.py` verifies backup integrity (tested by
  `scripts/test_backup_verify.py`). The prod compose stack runs a dedicated
  `backup` service; `k8s/mongodb-backup-cronjob.yaml` +
  `mongodb-restore-job.yaml` cover the k8s path.
- **DR runbook**: `docs/disaster_recovery.md`.
- **Secrets handling**: `docs/secrets.md`.
- **Encryption key rotation**: `docs/FIELD_ENCRYPTION_KEY_ROTATION.md` —
  `FIELD_ENCRYPTION_KEY` must be backed up before rotation; losing it makes
  encrypted fields (stored OAuth/BYOK tokens) unrecoverable.

## Operational behaviors worth knowing

- **Graceful shutdown**: SIGTERM stops accepting work, drains in-flight
  requests, then closes WebSocket managers and DB connections — safe for
  rolling restarts.
- **Startup checks**: the API refuses to start if MongoDB is unreachable;
  billing misconfiguration in `APP_ENV=production` fails startup (see
  `docs/CONFIGURATION.md`).
- **Migrations**: versioned, best-effort data migrations run at startup and
  are recorded in the `__forge_migrations` collection; a failing migration is
  logged and skipped, never blocks boot.
- **Dead-letter queue**: builds that exhaust Celery retries are recorded and
  can be inspected/retried at `/admin/builds/dead-letter`.
- **Rate limiting** is Redis-backed and **fails closed** to an in-memory
  limiter if Redis is down.
- **Runbook for degraded `/health/detailed`**: check Mongo (`mongo` service /
  replica set), Redis, then Celery workers (`docker compose ps`,
  `celery inspect ping`), in that order — the response body names the failing
  check.
