# Forge — Essential Documents

The short list of documents you actually need, in reading order. Everything
else is historical or component-local.

## Start here

| Document | What it covers |
|---|---|
| [`../README.md`](../README.md) | Product overview, quick start, project structure, credit system |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Services, build pipeline, PM layer, LLM routing, security model, data flow |
| [`API_REFERENCE.md`](API_REFERENCE.md) | Every backend endpoint, WebSocket events, `/v1/` versioning rules |
| [`CONFIGURATION.md`](CONFIGURATION.md) | Every environment variable and the startup validation rules |
| [`DEPLOYMENT_AND_OPERATIONS.md`](DEPLOYMENT_AND_OPERATIONS.md) | How prod actually deploys (VPS + compose, **not** k8s), CI, health checks, backups, runbook notes |

## Operational runbooks

| Document | What it covers |
|---|---|
| [`disaster_recovery.md`](disaster_recovery.md) | DR procedure for MongoDB |
| [`secrets.md`](secrets.md) | Secrets management policy |
| [`FIELD_ENCRYPTION_KEY_ROTATION.md`](FIELD_ENCRYPTION_KEY_ROTATION.md) | Rotating the field-encryption key safely |

## Component docs

| Document | What it covers |
|---|---|
| [`../orchestrator/README.md`](../orchestrator/README.md) | Review Board service: agent JSON schema, API, provider abstraction |
| [`../orchestration/README.md`](../orchestration/README.md) | Meta-orchestration workflow engine (internal tooling) |
| [`../backend/prompt_builder/README.md`](../backend/prompt_builder/README.md) | AI Gateway: dynamic Prompt Builder (per-role templates + context selection) |
| [`../backend/prompt_builder/MIGRATION.md`](../backend/prompt_builder/MIGRATION.md) | How agents migrated to the Prompt Builder |
| [`../k8s/README.md`](../k8s/README.md) | Why the k8s manifests are **not** the live deploy path |

## Historical / audit trail

`../CHANGELOG.md`, `../REPOSITORY_ANALYSIS.md`, `../IMPLEMENTATION_PLAN.md`,
`docs/archive/`, and the `orchestration/*_REPORT.md` files record past audits
and hardening work. Consult them for context, not current behavior.
