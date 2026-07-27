# Plan: Staging Environment + gstack Production Release Pipeline for Forge AI

## Goal
Create a staging environment on the same VPS as production, then integrate gstack's `/review` → `/qa` → `/ship` quality gates into forge-ai's branch workflow so every production release is validated before it hits live users.

## Decisions (resolved)

| Decision | Choice | Rationale |
|---|---|---|
| Staging infra model | Same VPS, separate compose project | Lowest cost, mirrors production closely |
| Staging domain | `staging.forge.example.com` | Subdomain of production; DNS: A record → VPS IP |
| Branch strategy | `main` = production, `develop` = staging | CI already runs on `develop`; matches existing convention |
| Staging deploy trigger | Push to `develop` branch via new `deploy-staging.yml` | Automatic, matches production pattern |
| Data isolation | Separate DB name, Redis DB, volumes, network | Zero shared state with production |
| Secrets model | Stripe test keys; other keys reuse same values | Real LLM/OAuth keys work in either env; billing must be test mode |
| Staging data reset | Fresh seed on each deploy (drop + recreate) | Prevents stale test data from masking bugs |
| gstack integration | `/review` on feature branch, `/qa` against staging, `/ship` opens PR to `develop` | Quality gate before staging deploy; existing CI remains baseline |
| Production deploy | Unchanged — merge `develop` → `main` triggers existing `deploy.yml` | No changes to proven production pipeline |

## Implementation Tasks

### 1. Create staging Docker Compose file
**File:** `docker-compose.staging.yml`

Create a sibling to `docker-compose.prod.yml` that mirrors the production stack with isolation baked in:

- **Project name:** `forge-staging` (Compose auto-prefixes networks/volumes)
- **Network:** separate subnet `172.29.0.0/16` (production uses `172.28.0.0/16`)
- **Services:** nginx, backend, worker, mongo, redis, certbot, backup — same structure as prod
- **Ports:** expose on different host ports or no host ports (nginx only)
- **Volumes:** `mongo_data_staging`, `redis_data_staging`, `letsencrypt_staging`, `certbot_www_staging`, `backup_data_staging`
- **Environment overrides:**
  - `APP_ENV=production` (same validation strictness)
  - `MONGODB_URL` points to `mongo` service in staging network
  - `REDIS_URL` points to `redis` service in staging network
  - `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` use test key placeholders
  - `ALLOWED_ORIGINS` and `APP_URL` point to staging domain
  - `API_URL` points to staging domain

### 2. Create staging environment template
**File:** `.env.staging.example`

Mirror `.env.production.example` with:
- `DOMAIN=staging.forge.example.com`
- `LETSENCRYPT_EMAIL` (same or separate)
- `GHCR_OWNER` (same)
- `IMAGE_TAG=latest` (or SHA from deploy)
- All Stripe keys prefixed with `sk_test_` / `pk_test_` / `whsec_test_`
- All other required vars identical format

### 3. Create staging deploy workflow
**File:** `.github/workflows/deploy-staging.yml`

Mirror `deploy.yml` with these changes:
- Trigger: `push` to `develop` branch only
- SCP target: `/opt/forge-staging` (separate directory on VPS)
- Compose file: `docker-compose.staging.yml`
- Environment file: `/opt/forge-staging/.env`
- Health check: `curl -fsS "https://staging.forge.example.com/api/health"`
- Use separate GitHub Secrets: `VPS_STAGING_HOST` (or reuse `VPS_HOST` with different target path)

### 4. VPS bootstrap script
**File:** `deploy/scripts/init-staging.sh`

Script to run once on VPS to set up staging:
- Create `/opt/forge-staging` directory
- Copy `docker-compose.staging.yml` and `deploy/` assets
- Create empty `.env` file
- Set up cron/backup if needed
- Note: certbot needs separate cert for staging domain (can use same certbot container with different webroot)

### 5. Nginx staging config
**File:** `deploy/nginx/templates/default.staging.conf.template`

Nginx config for staging subdomain:
- Listen on port 80 for `staging.forge.example.com`
- Proxy to `backend:8000`
- Let's Encrypt challenge path
- Can either extend the existing nginx config with a second server block, or run a separate nginx container — **separate nginx container on different ports is simpler** and avoids config merge conflicts

### 6. gstack workflow documentation
**File:** `docs/GSTACK_RELEASE_PIPELINE.md`

Document the complete release flow:

```
Feature branch
  → /review (structural code audit)
  → /qa (browser QA against staging.forge.example.com)
  → /ship (opens PR to develop)
  → CI runs on PR (lint, test, security, prod-artifacts)
  → Merge to develop → auto-deploy to staging
  → /qa re-runs on updated staging (optional second pass)
  → Merge develop → main → auto-deploy to production
  → /canary monitors production for 15-30 min
```

### 7. GitHub Secrets configuration
Add to repo secrets:
- `VPS_HOST` — already exists (reuse for staging)
- `VPS_USER` — already exists (reuse)
- `VPS_SSH_KEY` — already exists (reuse)
- `PUBLIC_DOMAIN` — already exists (used in deploy.yml build args)
- No new secrets required if staging uses same host; separate target path is sufficient

### 8. DNS configuration (manual step)
Create A record: `staging.forge.example.com` → VPS IP address

## Failure Modes & Mitigations

| Failure | Mitigation |
|---|---|
| Staging deploy fails | `deploy-staging.yml` has same rollback pattern as `deploy.yml` (re-run with earlier SHA) |
| Staging and prod share resources | Isolated network `172.29.0.0/16`, separate volumes, separate DB name |
| Staging certbot conflicts | Separate nginx container avoids webroot path collision; certbot in staging project uses its own volumes |
| `/qa` blocks on auth | `/setup-browser-cookies` run before `/qa`; seed staging with test accounts |
| Staging data pollution | Fresh DB seed on each deploy via entrypoint script or init container |
| Stripe test mode leaks to prod | `APP_ENV=production` + `sk_test_` prefix validation in backend config smoke test catches this |

## Validation Steps

1. **Local:** `docker compose -f docker-compose.staging.yml config -q` validates interpolation
2. **CI:** Add staging compose validation to `ci.yml` or `deploy-staging.yml`
3. **Deploy:** Push to `develop` triggers `deploy-staging.yml`; verify health check passes
4. **Isolation:** Verify staging MongoDB has separate DB name; prod data not visible
5. **gstack:** Run `/review` → `/qa` → `/ship` on a test feature branch; verify PR opens to `develop`
6. **Full pipeline:** Merge feature → `develop` → staging deploy → `/qa` passes → merge `develop` → `main` → prod deploy

## Out of Scope

- Kubernetes migration (existing `k8s/` manifests are future work, not touched here)
- Multi-region deploy
- Feature flags / progressive rollout
- Load testing or performance benchmarking
