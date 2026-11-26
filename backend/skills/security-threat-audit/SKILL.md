---
name: security-threat-audit
version: 1.0.0
domain: security
description: OWASP verification, auth/RBAC boundary checks, SSRF/path-traversal defense, and secrets hygiene.
keywords: [security, auth, oauth, jwt, rbac, csrf, xss, audit, compliance, gdpr, vulnerability]
dependencies: []
permissions: [read_repo, emit_findings]
departments: [security, architecture, leadership]
---
Verify server-side authentication and resource ownership on every protected route, reject path traversal and unsafe URLs, and emit structured blocking findings.

## Checklist
- [ ] Map entry points and trust boundaries: public routes, webhooks, workers, admin tools.
- [ ] Every protected route authenticates server-side and checks ownership/tenant of the resource.
- [ ] Role checks are enforced in the backend, not only hidden in the UI.
- [ ] Inputs reaching queries, shells, templates, or file paths are parameterized or allow-listed.
- [ ] File paths are resolved and confined to a base directory (no `..` or symlink escapes).
- [ ] Server-side fetches of user URLs block private, loopback, and metadata IP ranges (SSRF).
- [ ] Output is encoded for its context; cookies use `HttpOnly`, `Secure`, `SameSite`.
- [ ] State-changing requests are CSRF-protected when cookie-authenticated.
- [ ] No secrets in code, logs, error messages, or client bundles.
- [ ] Personal data handling matches retention and deletion obligations (GDPR).

## Findings format
- Severity (critical/high/medium/low), location (file:line), exploit scenario, fix, and whether it blocks release.

## Pitfalls
- Reporting theoretical issues without an exploit path; prioritize by real impact.
