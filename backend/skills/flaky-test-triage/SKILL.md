---
name: flaky-test-triage
version: 1.0.0
domain: quality_engineering
description: Diagnosing and fixing flaky, intermittent, or order-dependent tests caused by timing, shared state, or nondeterminism.
keywords: [flaky, flaky test, flake, triage, intermittent, nondeterministic, non-deterministic, order-dependent, race condition, quarantine, fails randomly, timing issue]
dependencies: [automated-qa-verification]
permissions: [read_repo, run_tests]
departments: [quality, engineering]
---
A flaky test is a bug in the test or the code; reproduce it deliberately, fix the root cause, and never paper over it with blind retries.

## Checklist
- [ ] Reproduce: run the test in a loop (`pytest --count`, `--repeat-each`) and with random ordering.
- [ ] Run it alone and with the full suite to detect order dependence or leaked state.
- [ ] Check for shared state: globals, singletons, module caches, database rows, temp files.
- [ ] Check timing: fixed sleeps, unawaited coroutines, real clocks, timeouts too tight for CI.
- [ ] Check nondeterminism: unseeded randomness, set/dict ordering, concurrency, network calls.
- [ ] Replace sleeps with condition-based waits; freeze or inject time.
- [ ] Reset singletons and fixtures between tests.
- [ ] If it cannot be fixed now, quarantine it with an owner and an issue link, not a silent skip.
- [ ] Track flake rate per test so regressions are visible.
- [ ] Confirm the fix with a high-iteration loop before closing.

## Pitfalls
- Adding automatic retries that hide a real race condition in production code.
- Deleting the test instead of fixing what it was guarding.
