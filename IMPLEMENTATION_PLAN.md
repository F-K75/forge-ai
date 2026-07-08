# Fix: ReDoS / NoSQL Injection in Search Endpoints (P0)

## Problem

The `list_items` endpoint in `backend/api/marketplace.py` (lines 93-96) and the
`list_tasks` endpoint in `backend/api/tasks.py` (lines 103-107) pass the raw
`search` query parameter directly into a MongoDB `$regex` query **without**
sanitizing it first.

An attacker can submit a crafted regex pattern that triggers catastrophic
backtracking (ReDoS), causing the MongoDB server to spend unbounded CPU time
evaluating the pattern. This is a denial-of-service vulnerability that can
exhaust database connections and degrade or crash the service.

The `admin.py` search endpoints already correctly apply `sanitize_string()`
from `core/security.py`, but the marketplace and tasks endpoints were missed
during that security hardening pass.

## Root Cause

- `marketplace.py:93-96`: `search` is interpolated directly into `$regex`
- `tasks.py:103-107`: `search` is interpolated directly into `$regex`
- Neither file imports or calls `sanitize_string()`, which strips control
  characters, caps length, and escapes regex metacharacters via `re.escape()`

## Solution

Apply the same `sanitize_string(search, max_length=100)` pattern already used
in `admin.py` to both `marketplace.py` and `tasks.py`.

1. Import `sanitize_string` from `core.security` in both files.
2. Before constructing the `$regex` query, sanitize the `search` value.
3. Use the sanitized value in the `$or` clause.

No other changes are needed: the existing caching, pagination, and query
structure remain intact.

## Architecture Changes

None — this is a security hardening change in existing API handlers.

## Database Changes

None.

## API Changes

None — the endpoint signatures, request/response schemas, and behaviour are
unchanged. Only the internal query construction is hardened.

## UI Changes

None.

## Testing Strategy

- Unit: verify that malicious regex patterns are neutralized (special chars
  escaped, length capped) before reaching MongoDB.
- Integration: confirm that normal search queries still return expected results
  after sanitization.
- Regression: run the full backend test suite (`pytest`) to ensure no
  collateral damage.

## Risks

- **Very low**: `sanitize_string()` is already used in production on the admin
  search endpoints. The function escapes regex metacharacters and truncates to
  a safe length, so normal user search queries are unaffected.
- **Very low**: the `max_length=100` cap matches the admin endpoints and is
  generous for a free-text search field.

## Rollback Plan

Revert the two edits in `marketplace.py` and `tasks.py` to restore the raw
`$regex` query. The endpoints will continue to function (just without the
ReDoS protection).
