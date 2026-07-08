# Implementation Plan: Test Coverage Enforcement (P1)

## Problem
The backend has 450 tests but no coverage measurement or enforcement. Untested code paths (especially error handlers, fallback paths, and security controls) could regress without detection.

## Root Cause
`pytest.ini` and `pyproject.toml` have no `--cov` configuration. CI runs tests without coverage flags.

## Solution
1. Add `pytest-cov` to `backend/requirements.txt`
2. Configure coverage in `backend/pyproject.toml`:
   - Minimum 70% overall threshold
   - `--cov=core,api,agents,sandbox` (source paths)
   - Exclude `__init__.py`, migrations, test files
3. Add coverage step to CI workflow after tests
4. Run `pytest --cov` locally to establish baseline

## Architecture Changes
- None — purely additive testing infrastructure
- `pyproject.toml` gets a `[tool.coverage.run]` section

## Testing Strategy
- Run full test suite with coverage enabled
- Verify threshold enforcement works (intentionally fail threshold temporarily)
- Ensure CI pipeline reports coverage percentage

## Risks
- **Low**: pytest-cov is well-established; no behavior changes
- Coverage may be below threshold initially; we set a realistic baseline

## Rollback Plan
- Revert `pyproject.toml` changes
- Revert `requirements.txt` pin
- Revert CI workflow change