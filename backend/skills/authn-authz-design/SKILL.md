---
name: authn-authz-design
version: 1.0.0
domain: security
description: Authentication flows, session and token handling, RBAC and tenant isolation, and resource ownership checks.
keywords: [login, authentication, authorization, session, oauth, oidc, sso, jwt, rbac, role, permission, password, mfa, tenant isolation, ownership, idor, access control]
dependencies: []
permissions: [read_repo]
departments: [security, architecture, engineering]
---
Authenticate with proven libraries and providers, authorize every request on the server against the specific resource, and isolate tenants by default.

## Authentication
- [ ] Use a vetted provider/library (OIDC, OAuth 2.1 with PKCE); never hand-roll crypto.
- [ ] Hash passwords with argon2id or bcrypt; rate-limit and lock out brute force.
- [ ] Offer MFA for privileged accounts; require re-auth for sensitive actions.
- [ ] Keep access tokens short-lived; rotate refresh tokens and detect reuse.
- [ ] Validate JWT signature, algorithm, issuer, audience, and expiry on every request.
- [ ] Invalidate sessions on logout, password change, and role change.

## Authorization
- [ ] Centralize checks in one policy layer (`can(user, action, resource)`).
- [ ] Check ownership/tenant of the specific resource, not just the user's role.
- [ ] Deny by default; new routes are protected unless explicitly public.
- [ ] Scope every query by tenant/project id at the repository layer.
- [ ] Log authorization denials and privilege changes for audit.

## Tests to add
- Cross-tenant access, expired/forged token, downgraded role, direct object id guessing.

## Pitfalls
- Trusting role or tenant claims sent by the client in the body.
- Accepting `alg: none` or mixing symmetric/asymmetric JWT keys.
