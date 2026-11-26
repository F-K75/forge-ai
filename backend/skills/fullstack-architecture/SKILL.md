---
name: fullstack-architecture
version: 1.0.0
domain: software_engineering
description: API contract design, modular service decomposition, and clean TypeScript/Python interfaces.
keywords: [api, fastapi, endpoint, contract, backend, frontend, react, typescript, architecture]
dependencies: []
permissions: [read_repo]
departments: [architecture, engineering, leadership]
---
Define typed API contracts first, isolate side effects behind repository interfaces, and avoid circular imports.

## When to use
- Adding a feature that spans backend routes, services, and frontend views.
- Splitting a growing module or deciding where new code belongs.

## Checklist
- [ ] Write the request/response schema (Pydantic model + TypeScript type) before the handler.
- [ ] Keep route handlers thin: parse input, call a service, shape the response.
- [ ] Put persistence behind a repository/DAO; services never build raw queries.
- [ ] Inject dependencies (db, clients, clock) so services are testable without I/O.
- [ ] Keep the dependency direction one-way: api -> services -> repositories -> models.
- [ ] Share or generate types across the boundary; never hand-copy field lists.
- [ ] Evolve contracts additively; do not rename or retype existing fields.
- [ ] Name modules after the domain concept, not the technology ("billing", not "utils2").

## Pitfalls
- Circular imports between services: extract the shared piece into a lower layer.
- "God" services that own unrelated workflows: split by aggregate/ownership.
- Leaking raw database documents to clients (internal fields, `_id`).
