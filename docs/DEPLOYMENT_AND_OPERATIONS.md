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

## First-time production go-live

Do this once before the first successful `Deploy to production` run. Staging
bootstrap is covered in `docs/GSTACK_RELEASE_PIPELINE.md`.

### 1. VPS

- Ubuntu 22.04+ (or similar), public IP, Docker Engine + Compose plugin installed.
- Open ports **80** and **443**.
- Create deploy dir and SSH user that can run Docker:

```bash
sudo mkdir -p /opt/forge
sudo chown "$USER":"$USER" /opt/forge
```

### 2. DNS

Create an A record for your domain → VPS IP (e.g. `forge.example.com`).

### 3. GitHub Actions secrets & variables

Repository **Secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH username |
| `VPS_SSH_KEY` | Private key for that user (full PEM) |

Repository **Variables**:

| Variable | Value |
|---|---|
| `PUBLIC_DOMAIN` | Domain only, no scheme (e.g. `forge.example.com`) |
| `ADMIN_EMAILS` | Comma-separated admin emails baked into the frontend |

### 4. VPS `.env` (required before first compose up)

On the VPS:

```bash
# From a machine with the repo (or scp these files once):
scp docker-compose.prod.yml .env.production.example deploy/ "$VPS_USER@$VPS_HOST:/opt/forge/"
# Then on the VPS:
cd /opt/forge
cp .env.production.example .env
# Fill every REQUIRED value — see comments in the file.
# Generate secrets with: openssl rand -hex 32
```

Minimum required: `DOMAIN`, `LETSENCRYPT_EMAIL`, `GHCR_OWNER`, `ANTHROPIC_API_KEY`,
`JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `MONGO_PASSWORD`, `REDIS_PASSWORD`,
`ADMIN_EMAILS`, Stripe live keys + price IDs, `APP_ENV=production`.

`GHCR_OWNER` must be the lowercase GitHub user/org that owns the images
(for this repo: `f-k75`).

Log the VPS into GHCR so `docker compose pull` can fetch private/org images:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

### 5. TLS bootstrap (once)

```bash
cd /opt/forge
./deploy/scripts/init-letsencrypt.sh
# Then either wait for CI deploy, or:
docker compose -f docker-compose.prod.yml up -d
```

### 6. Trigger deploy

Push to `main` or run **Actions → Deploy to production → Run workflow**.
Confirm `https://$DOMAIN/api/health` returns OK.

### Common blockers

| Symptom | Fix |
|---|---|
| Frontend image build: `npm ci` / lockfile out of sync | Run `npm install` in `frontend/` and commit `package-lock.json` |
| Deploy SSH fails | Check `VPS_*` secrets and that the key user owns `/opt/forge` |
| `curl https://$DOMAIN/api/health` fails after up | Check `.env` on VPS, `docker compose -f docker-compose.prod.yml ps`, backend logs |
| Frontend built with empty API URL | Set repo variable `PUBLIC_DOMAIN` before building images |
| Pull from GHCR denied | `docker login ghcr.io` on the VPS; ensure package visibility allows the account |

## Staging environment

Staging is documented in `docs/GSTACK_RELEASE_PIPELINE.md`. In brief: pushes to
`develop` trigger `.github/workflows/deploy-staging.yml`, which deploys an
isolated stack to `/opt/forge-staging` on the same VPS using
`docker-compose.staging.yml`. It has its own domain, MongoDB database, Redis DB,
volumes, and Stripe test keys.

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
