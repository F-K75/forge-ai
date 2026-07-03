# k8s manifests — not the live deploy path

These manifests are **not currently wired into CI/CD** and are **not what production runs on**.

The actual production deploy path is `.github/workflows/deploy.yml`: it builds Docker images,
pushes them to GHCR, and deploys via `docker-compose` over SSH to a single VPS. No workflow in
this repo runs `kubectl apply` (or equivalent) against any of these manifests.

Treat this directory as a starting point for a future move to Kubernetes, not as documentation
of the current deployment. If you're debugging a production incident or trying to understand
how the app is actually deployed, look at `deploy.yml` and `docker-compose.prod.yml`, not here.

If/when a real move to k8s happens, these manifests will need review before use — they were
last reconciled against the app's actual environment variables and image references on
2026-07-03 (see `MASTER_EXECUTION_PLAN.md`, item SEC-019), not validated end-to-end against a
running cluster.
