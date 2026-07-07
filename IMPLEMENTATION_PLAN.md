# IMPLEMENTATION_PLAN.md — CSP Headers for Generated Applications (AI-007, P1)

> Status: **COMPLETE** — `sandbox/csp.py` deterministically injects a secure
> default CSP into generated apps at build time (HTML `<meta>` + FastAPI
> middleware). Idempotent, never weakens an existing policy, never breaks
> unsupported code. 13 new tests pass; full backend suite **349 passed**; ruff
> clean.

## Problem (verified empirically)

Forge generates full applications and deploys/previews them standalone. The
platform's own responses carry a CSP (`core/security.py:156`), but **generated
app output had no CSP at all** — an XSS in generated frontend code would run
with no `default-src`/`script-src` containment. MASTER_EXECUTION_PLAN lists
AI-007 as **OPEN** ("Add CSP headers to generated applications", AI/Security).

## Root Cause

No CSP was ever applied to the generated application's own responses/files.
The platform's CSP only protects Forge's *own* UI, not the apps it builds.

## Solution

New module `backend/sandbox/csp.py` with a strict-but-practical `DEFAULT_CSP`
(`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
base-uri 'self'; frame-ancestors 'none'; form-action 'self'`):

- `inject_html_csp` — inserts a CSP `<meta>` into `<head>` for any HTML entry
  point. **Idempotent**: if a CSP meta already exists, it is left untouched
  (we never weaken a user/agent-provided policy).
- `inject_fastapi_csp` — for the simple, supported shape
  (`from fastapi import FastAPI` + a **module-level** `app = FastAPI(...)`),
  appends a `BaseHTTPMiddleware` that sets the CSP header via
  `response.headers.setdefault` (so an app's own CSP still wins). **Guarded**:
  unsupported structures (indented app, different variable name) are skipped,
  never rewritten. **Idempotent** via a `# forge:csp` sentinel comment. A
  pre-existing Starlette middleware import is not duplicated.
- `apply_csp(files)` — mutates the `path → content` dict in place, returns a
  `CspReport` of what changed (`html_meta` / `fastapi_middleware` / `skipped`).

### Integration (no signature changes)
In `core/orchestrator.run_build`, immediately after the integration step and
before the sandbox/PM/deploy path:
- `csp_report = apply_csp(files)` — so the final stored `build_files`, the
  `BUILD_COMPLETE` payload, and the deployed container all carry the CSP.
- The final report is attached to `validation["csp"]` (emitted/persisted),
  alongside `validation["moderation"]`.

### Why this scope (deterministic, not LLM)
Injection is a deterministic code transform, consistent with the AI-002/AI-005
approach: no LLM call, no latency/cost, auditable, and unit-testable. It
protects the generated app wherever it runs, not just behind Forge's proxy.

## Architecture / API / DB / UI Changes

- No new API routes, schemas, or collections. The report rides the existing
  `validation` dict.
- Frontend already renders `validation`; the new `csp` key is ignored
  gracefully if not yet surfaced in the UI.

## Testing Strategy

- `tests/test_csp_injection.py` — 13 tests: HTML (no-head unchanged, head gets
  meta, idempotent, existing CSP not overridden), FastAPI (supported shape gets
  middleware, idempotent, nested/different-var skipped, no duplicate Starlette
  import), and `apply_csp` over a dict (mutates + reports, skips unsupported,
  idempotent across calls, ignores non-string entries).
- Full backend suite: **349 passed**.

## Risks

- `script-src 'self'` (no `unsafe-inline`) may block inline scripts in some
  generated apps at preview time; that is CSP working as intended. Generated
  Vite/React production builds use external module scripts, so this is the
  secure default. Tradeoff documented.
- Backend CSP is only injected for the simple module-level `app = FastAPI(`
  shape; other FastAPI layouts are skipped (reported, not broken). JSON API
  responses are low XSS-risk regardless.
- Pattern-based HTML detection keys on `<head>`/`<html>`; a generated doc with
  no `<head>` is left untouched.

## Rollback Plan

- Revert `backend/sandbox/csp.py`, the `apply_csp` import + call sites in
  `core/orchestrator.py`, and the tests. No schema/runtime impact.
