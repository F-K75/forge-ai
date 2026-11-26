---
name: infrastructure-as-code
version: 1.0.0
domain: devops
description: Terraform, Helm, and other declarative infrastructure with reviewed plans, remote state, drift detection, and environment parity.
keywords: [terraform, iac, infrastructure as code, helm, pulumi, cloudformation, provision, drift, tfstate, vpc, staging environment]
dependencies: []
permissions: [read_repo, write_infra]
departments: [infrastructure]
---
All infrastructure changes go through code review with a visible plan; nothing is changed by hand in the console.

## Checklist
- [ ] Store state remotely with locking and encryption; never commit state files.
- [ ] Split stacks by blast radius (network, data, compute) and by environment.
- [ ] Pin provider and module versions; upgrade deliberately.
- [ ] Parameterize environments with variables, keeping staging and production structurally identical.
- [ ] Run `fmt`, `validate`, a linter (tflint/checkov), and `plan` in CI; post the plan on the PR.
- [ ] Review plans for destroys and replacements; protect stateful resources (`prevent_destroy`).
- [ ] Tag every resource with owner, environment, and cost center.
- [ ] Reference secrets from a secret manager; never put them in variables files.
- [ ] Detect drift on a schedule and reconcile through code, not console edits.
- [ ] Document import steps for resources created before IaC adoption.

## Pitfalls
- Renaming a resource address and causing destroy/recreate of a database.
- Applying locally with stale state or credentials different from CI.
