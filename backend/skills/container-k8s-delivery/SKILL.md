---
name: container-k8s-delivery
version: 1.0.0
domain: devops
description: Dockerfiles, Kubernetes manifests, CI/CD pipelines, health probes, and rollback runbooks.
keywords: [docker, kubernetes, k8s, ci/cd, deploy, release, rollout, observability, prometheus]
dependencies: []
permissions: [read_repo]
departments: [infrastructure, delivery, architecture]
---
Ensure non-root containers, explicit readiness/liveness probes, resource limits, and tested rollback steps.

## Checklist
- [ ] Use a slim, pinned base image; multi-stage builds keep compilers out of runtime images.
- [ ] Order Dockerfile layers so dependency installs are cached separately from source copies.
- [ ] Run as a non-root user with a read-only root filesystem where possible.
- [ ] Keep `.dockerignore` tight: no `.env`, `.git`, tests, or local data in the image.
- [ ] Define readiness (can serve traffic) and liveness (process is healthy) probes separately.
- [ ] Set CPU/memory requests and limits; size them from observed usage.
- [ ] Inject configuration via env/ConfigMaps and secrets via Secrets/external stores, never baked in.
- [ ] Use rolling updates with `maxUnavailable: 0` or canaries for user-facing services.
- [ ] Handle SIGTERM: stop accepting work, drain in-flight requests within the grace period.
- [ ] Tag images immutably (git SHA); never deploy `latest` to production.
- [ ] Document and rehearse rollback (`kubectl rollout undo` or previous image tag).

## Pitfalls
- Liveness probes that hit dependencies and restart healthy pods during a DB blip.
- Migrations that are not backward compatible with the previous app version during rollout.
