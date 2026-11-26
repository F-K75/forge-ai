---
name: refactoring-legacy-code
version: 1.0.0
domain: software_engineering
description: Safe, incremental refactoring of legacy modules behind characterization tests, with no behaviour change per step.
keywords: [refactor, legacy, tech debt, technical debt, cleanup, clean up, dead code, decouple, monolith, modulariz, rewrite, simplif]
dependencies: [fullstack-architecture, automated-qa-verification]
permissions: [read_repo, write_code, run_tests]
departments: [engineering, architecture]
---
Pin current behaviour with characterization tests, then change structure in small, separately verifiable steps that never mix refactoring with feature work.

## Checklist
- [ ] Identify the seam: the smallest boundary you can test around without touching internals.
- [ ] Write characterization tests that record current outputs, including odd ones.
- [ ] Make one mechanical change per commit (extract, rename, move, inline) and run tests each time.
- [ ] Keep public signatures stable; add adapters or deprecation shims for old call sites.
- [ ] Delete dead code only after confirming no references (grep, coverage, runtime logs).
- [ ] Replace hidden globals and singletons with injected dependencies where you touch them.
- [ ] Track remaining debt explicitly (TODO with owner, or an issue).
- [ ] Measure before/after for anything on a hot path.

## Strategy
- Prefer strangler-fig replacement over big-bang rewrites.
- Leave the code better than you found it, but stay inside the agreed scope.

## Pitfalls
- "While I'm here" behaviour changes hidden inside a refactor diff.
- Fixing a bug that callers silently depend on without flagging it.
