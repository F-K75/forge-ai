---
name: ci-pipeline-engineering
version: 1.0.0
domain: devops
description: Fast, reliable CI pipelines with GitHub Actions - caching, parallel jobs, required checks, and reproducible builds.
keywords: [ci, github actions, ci pipeline, ci/cd, workflow yaml, required check, build cache, failing build, lint job, matrix build, deploy pipeline]
dependencies: []
permissions: [read_repo]
departments: [infrastructure, delivery, engineering]
---
Keep CI fast, deterministic, and trustworthy: every required check must be meaningful, reproducible locally, and green on the main branch.

## Checklist
- [ ] Fail fast: run lint and type checks before slow test suites.
- [ ] Split independent jobs (backend, frontend, image build) to run in parallel.
- [ ] Cache dependencies keyed on lockfile hashes; never cache build outputs blindly.
- [ ] Pin action versions (ideally by SHA) and tool versions; use lockfiles for installs.
- [ ] Give jobs least-privilege `permissions:` and avoid exposing secrets to fork PRs.
- [ ] Use `concurrency` groups to cancel superseded runs on the same branch.
- [ ] Make every check runnable locally with the same command (`make test`, `npm run ci`).
- [ ] Upload test reports and artifacts on failure for debugging.
- [ ] Mark only stable, relevant checks as required for merge.
- [ ] Track pipeline duration and flake rate; fix regressions like product bugs.

## Pitfalls
- `continue-on-error` or `|| true` hiding real failures.
- Steps that grep for output text that changed format, passing or failing for the wrong reason.
- Deploy steps triggered from untrusted pull request contexts.
