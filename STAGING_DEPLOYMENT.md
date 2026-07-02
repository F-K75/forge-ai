# Staging Deployment Guide (superseded)

> **This document is superseded by [DEPLOYMENT.md](./DEPLOYMENT.md).**
>
> It described a manual staging setup referencing files that were never added
> to the repo (`deploy-staging.yml`, `backup-mongodb.sh`, a standalone nginx
> config, `load-test.js`, `prometheus.yml`). The production deployment now
> lives in `docker-compose.prod.yml` + `deploy/` + `.github/workflows/deploy.yml`,
> all documented in [DEPLOYMENT.md](./DEPLOYMENT.md) — including the security
> smoke tests (headers, rate limiting, CORS) that used to live here.
>
> To rehearse a deployment without a real domain, see "Local rehearsal" in
> DEPLOYMENT.md, or issue staging certificates with
> `./deploy/scripts/init-letsencrypt.sh --staging`.
