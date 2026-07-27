# gstack Production Release Pipeline

## Overview

Forge AI uses gstack quality gates integrated with a staging environment to validate every production release before it reaches live users.

## Branch Strategy

| Branch | Environment | Deploy Trigger |
|---|---|---|
| `main` | Production | Push to `main` → `.github/workflows/deploy.yml` |
| `develop` | Staging | Push to `develop` → `.github/workflows/deploy-staging.yml` |
| Feature branches | None | PR to `develop` triggers CI + gstack gates |

## gstack Quality Gates

Every feature branch must pass gstack gates before merging to `develop`:

```
/review  →  /qa  →  /ship
```

### 1. `/review`
Structural code audit on the feature branch. Catches bugs passing CI but likely to blow up in production (race conditions, bad trust boundaries, missing enum handlers, N+1 queries).

### 2. `/qa`
Browser QA against `https://staging.forge.example.com`. Run `/setup-browser-cookies` first if auth is required.

### 3. `/ship`
Opens/updates a PR to `develop` with coverage diagram and auto-generated tests for gaps.

## CI Pipeline (runs on every PR)

The existing `.github/workflows/ci.yml` runs:
- Backend: lint (ruff), security (bandit, pip-audit), type-check, production config smoke test, pytest (60% coverage)
- Frontend: lint (eslint), vitest, npm audit, tsc + vite build
- Orchestrator: lint + pytest
- Prod-artifacts: compose validation, Docker image builds, HEALTHCHECK verification
- Quality gate: blocks merge if any job fails

## Staging Deploy

Merge to `develop` triggers `.github/workflows/deploy-staging.yml`:
1. Builds backend/frontend images, pushes to GHCR tagged with commit SHA
2. SCPs `docker-compose.staging.yml` + `deploy/` to `/opt/forge-staging` on the VPS
3. Runs `docker compose pull && up -d --remove-orphans`
4. Health check: `curl -fsS https://staging.forge.example.com/api/health`

**Rollback:** Re-run `deploy-staging.yml` manually with an earlier commit SHA as `image_tag`.

## Production Deploy

Merge `develop` → `main` triggers the existing `.github/workflows/deploy.yml`:
1. Builds/pushes images to GHCR
2. SCPs to `/opt/forge` on the VPS
3. `docker compose pull && up -d --remove-orphans`
4. Health check: `curl -fsS https://$DOMAIN/api/health`

**Rollback:** Re-run `deploy.yml` manually with an earlier commit SHA.

## Post-Deploy Monitoring

After production deploy, run `/canary` against the production URL for 15–30 minutes to catch console errors, performance regressions, and visual anomalies.

## Staging Bootstrap (one-time)

Run once on the VPS:
```bash
./deploy/scripts/init-staging.sh
```

This script:
- Creates `/opt/forge-staging`
- Copies compose file and deploy assets
- Creates `.env` from `.env.staging.example`
- Obtains Let's Encrypt certificate for staging domain
- Starts the staging stack

## Environment Isolation

| Aspect | Production | Staging |
|---|---|---|
| Compose project | `forge` | `forge-staging` |
| Network | `172.28.0.0/16` | `172.29.0.0/16` |
| MongoDB DB | `forge` | `forge_staging` |
| Redis DB | `0` | `1` |
| Volumes | `mongo_data`, `redis_data`, etc. | `mongo_data_staging`, `redis_data_staging`, etc. |
| Domain | `${DOMAIN}` | `${STAGING_DOMAIN}` |
| Stripe keys | `sk_live_*` | `sk_test_*` |
| Backend port exposure | none (nginx only) | `127.0.0.1:8001` (nginx proxy) |

## Secrets Configuration

GitHub repository secrets (reused for staging):
- `VPS_HOST` — VPS IP/hostname
- `VPS_USER` — SSH user
- `VPS_SSH_KEY` — SSH private key
- `PUBLIC_DOMAIN` / `STAGING_DOMAIN` — repository variables for build args

## Required Repo Variables

Add to GitHub repository variables (Settings → Variables):
- `PUBLIC_DOMAIN` — production domain (e.g. `forge.example.com`)
- `STAGING_DOMAIN` — staging domain (e.g. `staging.forge.example.com`)
- `ADMIN_EMAILS` — admin email addresses

## DNS Configuration

Create A records pointing to the VPS IP:
- `forge.example.com` → VPS IP
- `staging.forge.example.com` → VPS IP

## Failure Modes

| Failure | Mitigation |
|---|---|
| Staging deploy fails | Re-run workflow with earlier SHA |
| Staging/prod share state | Isolated networks, volumes, DB names |
| `/qa` blocks on auth | Run `/setup-browser-cookies`; seed staging with test accounts |
| Staging data pollution | Fresh DB on each deploy |
| Stripe test keys leak to prod | `APP_ENV=production` + `sk_test_` prefix validation in CI |

## Out of Scope

- Kubernetes migration (see `k8s/README.md`)
- Multi-region deploy
- Feature flags / progressive rollout
- Load testing or performance benchmarking
