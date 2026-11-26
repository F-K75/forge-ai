---
name: secrets-management
version: 1.0.0
domain: security
description: Storing, injecting, rotating, and scanning for secrets such as API keys, tokens, and database credentials.
keywords: [secret, secrets, api key, credential, vault, .env, env var, rotation, rotate, kms, leaked, token leak, gitleaks, secret scanning]
dependencies: []
permissions: [read_repo]
departments: [security, infrastructure, engineering]
---
Secrets live in a secret manager, reach processes at runtime with least privilege, rotate on a schedule, and are revoked immediately when exposed.

## Checklist
- [ ] Keep secrets out of git, images, logs, and client bundles; `.env` files are gitignored.
- [ ] Load secrets from a manager (Vault, cloud secret manager, Kubernetes Secrets) at runtime.
- [ ] Give each service its own credential with the minimum scope it needs.
- [ ] Prefer short-lived tokens (OIDC, workload identity) over long-lived static keys.
- [ ] Encrypt secrets at rest and in transit; restrict who can read them and audit access.
- [ ] Run secret scanning (gitleaks, trufflehog, push protection) in pre-commit and CI.
- [ ] Redact secret-shaped values in logs and error reports.
- [ ] Document rotation for each secret and rotate on a schedule.

## If a secret leaked
- [ ] Revoke or rotate it first, then remove it from code and history.
- [ ] Check access logs for use during the exposure window.
- [ ] Record the incident and add a scanner rule if it was missed.

## Pitfalls
- Deleting the commit but not rotating the key (history and forks keep it).
- Sharing one admin credential across services and environments.
