---
name: automated-qa-verification
version: 1.0.0
domain: quality_engineering
description: Unit, integration, and E2E test authoring with regression coverage and deterministic assertions.
keywords: [test, pytest, vitest, playwright, e2e, qa, coverage, regression, verify]
dependencies: []
permissions: [read_repo, run_tests]
departments: [quality, engineering]
---
Cover happy paths, boundary conditions, failure propagation, and authorization denial paths with isolated deterministic tests.

## Checklist
- [ ] Start from acceptance criteria; write at least one test per criterion.
- [ ] Choose the lowest layer that proves the behaviour (unit > integration > E2E).
- [ ] Cover boundaries (empty, one, max, max+1), invalid input, and error propagation.
- [ ] Test authorization: unauthenticated, wrong user, wrong tenant, insufficient role.
- [ ] Keep tests isolated: fresh fixtures, no shared mutable state, no test ordering.
- [ ] Remove nondeterminism: freeze time, seed randomness, stub network and LLM calls.
- [ ] Assert on behaviour and outputs, not on private implementation details.
- [ ] Add a regression test that fails before every bug fix and passes after.
- [ ] Use clear test names: `test_<unit>_<condition>_<expected>`.
- [ ] Run the full relevant suite locally before declaring done; report exact pass/fail counts.

## Pitfalls
- Tests that mock the very thing they claim to test.
- Snapshot tests nobody reads, updated blindly on every change.
- Coverage targets met with assertion-free tests.
