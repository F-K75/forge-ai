---
trigger: always_on
---

# Forge AI Security Policy (`.agents/rules/security-policy.md`)

This security policy governs all agent actions, code modifications, and infrastructure configurations inside `/Users/keshav/forge-ai`.

## 1. Secrets & Credential Protection

1. **No Modifying Secrets or Production Credentials**:
   - Agents must **NEVER** modify, overwrite, rotate, or delete production credentials, `.env`, `.dev.vars`, cloud secret manager entries, or live API keys.
2. **Zero Secret Echoing**:
   - Agents must **NEVER** output literal secret values, API keys, JWT signing keys, OAuth client secrets, webhook secrets, or database connection strings containing passwords in chat responses, markdown documents, commit messages, or logs. Refer to secrets strictly by variable name and `file:line`.
3. **No Plaintext Secrets in Kubernetes or Git**:
   - `k8s/secrets.yaml` must never contain real credentials or deployable insecure placeholder strings (`CHANGE_ME_*`, `placeholder`) in active cluster manifests without an external secret operator (`ExternalSecret`, `SealedSecret`) or pre-deploy validation guard.
   - `.gitallowed` must not be abused to whitelist real secrets or sensitive payload dumps (`req.json`, `gemini_resp.json`, `dump.rdb`).

## 2. Database & State Safety

1. **No Destructive Database Migrations Without Approval**:
   - Agents must **NEVER** execute `drop_collection`, `drop_database`, `delete_many({})`, `drop_index`, or destructive schema migrations against MongoDB or Redis `FLUSHALL`/`FLUSHDB` without explicit CTO consent.
2. **Tenant & User Isolation (Anti-IDOR)**:
   - Every REST endpoint (`backend/api/*.py`) and WebSocket handler (`backend/main.py`, `backend/api/builds.py`, `backend/api/initiatives.py`) must verify that the authenticated `user_id` owns or is authorized to access the requested `project_id`, `build_id`, or `initiative_id`.

## 3. Authentication, WebSockets, CSRF & Webhooks

1. **WebSocket Authentication**:
   - WebSocket endpoints must authenticate connections via the `ws-token` `Sec-WebSocket-Protocol` header (rather than URL query parameters whenever possible, as query strings leak into proxy and access logs) and verify resource ownership before streaming Redis pub/sub events.
2. **CSRF Protection**:
   - All state-mutating cookie-authenticated requests (`POST`, `PUT`, `PATCH`, `DELETE`) must enforce double-submit CSRF token validation, with explicit tests in `backend/tests/test_csrf_coverage.py`.
3. **Cryptographic Webhook Verification**:
   - Payment and external webhooks (`backend/api/webhooks.py`, `backend/api/billing.py`, `backend/api/cashfree.py`) must fail closed (`HTTP 400/401/503`) if webhook signing secrets are missing or signature verification fails. Never allow unverified webhook payloads in non-test environments.
4. **BYOK Key Encryption**:
   - User-supplied LLM API keys (`backend/api/api_keys.py`) must be encrypted at rest using Fernet/AES-GCM with a dedicated encryption key and never returned in plaintext via API responses.

