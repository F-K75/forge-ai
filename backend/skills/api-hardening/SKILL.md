---
name: api-hardening
version: 1.0.0
domain: software_engineering
description: Input validation, bounded pagination, structured error responses, and backward-compatible routing.
keywords: [api, endpoint, route, fastapi, validation, pydantic, rest, backend]
dependencies: [fullstack-architecture]
permissions: [read_repo, write_code]
departments: [engineering, architecture, security]
---
Validate all query/body parameters with strict bounds, enforce auth/ownership checks, and never expose stack traces.

## Checklist
- [ ] Every body/query/path param has a type plus bounds (`min_length`, `max_length`, `ge`, `le`).
- [ ] List endpoints are paginated with a capped `limit` and a stable sort key.
- [ ] Every protected route depends on the auth dependency and checks resource ownership.
- [ ] Return 404 (not 403) for resources the caller cannot see, to avoid existence leaks.
- [ ] Errors use one structured shape (`detail`, optional `code`); no tracebacks or SQL in responses.
- [ ] Reject unknown enum values explicitly instead of silently defaulting.
- [ ] Mutating endpoints are idempotent or accept an idempotency key where retries are likely.
- [ ] Declare response models so internal fields are filtered out.
- [ ] Rate-limit expensive or unauthenticated endpoints.
- [ ] Keep old routes working (or redirect) when paths change; log deprecated usage.

## Tests to add
- Boundary values (0, max, max+1), missing auth, another user's resource, malformed JSON.

## Pitfalls
- Trusting client-supplied ids for ownership (IDOR).
- Unbounded `limit` or regex/search params that allow expensive scans.
