---
name: supply-chain-security
version: 1.0.0
domain: security
description: Dependency vulnerability scanning, lockfiles and pinning, SBOMs, license checks, and safe upgrades of third-party packages.
keywords: [supply chain, cve, sbom, npm audit, pip-audit, lockfile, vulnerable dependency, dependency vulnerab, outdated dependenc, typosquat, license, dependabot, renovate]
dependencies: []
permissions: [read_repo, run_security_scan]
departments: [security]
---
Know exactly what third-party code ships, pin it, scan it continuously, and upgrade on a predictable cadence with tests as the safety net.

## Checklist
- [ ] Commit lockfiles for every ecosystem and install with them in CI and images.
- [ ] Pin direct dependencies; avoid unbounded ranges for runtime packages.
- [ ] Run vulnerability scans (`pip-audit`, `npm audit`, OSV, container image scan) in CI.
- [ ] Triage findings by reachability and exposure, not CVSS score alone.
- [ ] Generate an SBOM for released images and keep it with the release.
- [ ] Check new dependencies: maintenance activity, popularity, license, install scripts, name typos.
- [ ] Enable automated update PRs (Dependabot/Renovate) grouped by risk.
- [ ] Pin CI actions and base images by digest or exact version.
- [ ] Verify licenses are compatible with distribution (flag GPL/AGPL in proprietary code).

## Pitfalls
- Adding a large dependency for a ten-line helper.
- Ignoring transitive vulnerabilities because "we don't import it directly".
- Upgrading majors without reading changelogs or running the full test suite.
