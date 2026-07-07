# BE-003: Pagination for List Endpoints

## Status: COMPLETE (2026-07-07)

## Problem
Multiple list endpoints either returned all results without pagination (the
`.to_list(None)` unbounded-read risk called out in the BE-003 audit) or
hand-rolled their own `count_documents` / `skip` / `limit` math — with two
inconsistent `total_pages` formulas that both returned **`0` for an empty
result set**. An empty `total_pages` breaks client pagination controls and
misrepresents "no data" as an invalid page count. The logic was duplicated
across ~15 endpoints, so any fix had to be re-applied everywhere.

## Solution
Centralized all list-endpoint pagination behind the shared
`paginated_query` helper in `core/database.py` (already present) plus a new
reusable `PaginationParams` FastAPI dependency in `core/models.py`.

`paginated_query` is the single source of truth for the envelope and the
clamping rules:
- `page` clamped to `>= 1`
- `per_page` clamped to `[1, max_page_size]` (default 100)
- `total_pages` is **always `>= 1`** (never `0`)
- an out-of-range `page` is clamped to the last page (no empty 404-style page)

## Files Changed
- `backend/core/models.py` — new `PaginationParams` dependency (`page` /
  `per_page`, clamped, max 100).
- `backend/api/projects.py` — `list_projects` + `get_project_builds` route
  through `paginated_query`.
- `backend/api/admin.py` — `list_users`, `list_builds`, `list_security_events`,
  `list_audit_logs` route through `paginated_query` (typed mapping preserved).
- `backend/api/webhooks.py` — `list_webhooks` routes through `paginated_query`.
- `backend/api/api_keys.py` — `list_api_keys` routes through `paginated_query`.
- `backend/api/auth.py` — `list_members` and `list_organizations` route through
  `paginated_query` (also removes the unbounded empty-`total_pages` early return
  in `list_organizations`).
- `backend/tests/test_pagination.py` — new suite (8 tests): helper edge cases
  (clamp, empty → total_pages=1, out-of-range clamp) + endpoint integration
  tests for projects / admin users / webhooks.

## Testing Strategy
- Helper: default + max page-size clamp, page clamp, empty set → `total_pages=1`,
  out-of-range page clamp, projection applied.
- Endpoints: real `TestClient` against a fake Mongo; assert envelope
  (`items`, `total`, `page`, `per_page`, `total_pages`), that out-of-range pages
  clamp, and that sensitive fields (`hashed_password`, webhook `secret`) are
  excluded by the projection.
- Backward compatible: `page`/`per_page` default to 1 / 20; response shape
  unchanged (the `Paginated*` response models already existed).

## Validation
- `ruff check --select F,E9` — clean on all changed files.
- Full backend suite — **357 passed** (was 349; +8 new).
