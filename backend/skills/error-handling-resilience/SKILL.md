---
name: error-handling-resilience
version: 1.0.0
domain: software_engineering
description: Exception boundaries, timeouts, retries with backoff, circuit breakers, and graceful degradation for service calls.
keywords: [error handling, exception, retry, retries, timeout, backoff, circuit breaker, resilien, fallback, graceful, idempoten, transient]
dependencies: [api-hardening]
permissions: [read_repo, write_code]
departments: [engineering, architecture]
---
Fail loudly at boundaries, retry only transient and idempotent work with bounded backoff, and degrade gracefully instead of cascading failures.

## Checklist
- [ ] Every outbound call (HTTP, DB, LLM, queue) has an explicit timeout.
- [ ] Retries use exponential backoff with jitter and a hard cap on attempts and total time.
- [ ] Only retry transient errors (timeouts, 429, 5xx) and only idempotent operations.
- [ ] Catch exceptions at a boundary that can act on them; never `except Exception: pass`.
- [ ] Log with context (operation, ids, attempt), then re-raise or map to a typed domain error.
- [ ] Map domain errors to HTTP status codes in one place.
- [ ] Add a circuit breaker or fast-fail path for dependencies that are down.
- [ ] Define the degraded behaviour (cached value, partial result, feature off) explicitly.
- [ ] Release resources in `finally`/context managers; cancel background tasks on shutdown.

## Tests to add
- Dependency timeout, dependency 500 then success, permanent failure after max retries.

## Pitfalls
- Retry storms: retries at several layers multiply load on a struggling dependency.
- Swallowed exceptions that turn outages into silent data loss.
