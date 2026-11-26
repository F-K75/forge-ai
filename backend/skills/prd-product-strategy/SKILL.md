---
name: prd-product-strategy
version: 1.0.0
domain: product_business
description: PRD authorship, unit economics, pricing models, ICP validation, and measurable KPI definitions.
keywords: [prd, pricing, monetiz, revenue, business, roadmap, requirement, kpi, market]
dependencies: []
permissions: [read_repo]
departments: [business, leadership]
---
Link customer problems to measurable acceptance criteria, explicit scope boundaries, and sustainable unit economics.

## PRD checklist
- [ ] Problem: who has it (ICP/persona), how often, and the evidence (interviews, data, tickets).
- [ ] Goal and success metrics: one primary KPI with a target and a measurement method.
- [ ] Guardrail metrics that must not regress (latency, churn, support load).
- [ ] Scope: in scope, explicitly out of scope, and future considerations.
- [ ] User stories with testable acceptance criteria for each in-scope capability.
- [ ] Risks, assumptions, and open questions with owners.
- [ ] Rollout plan: flags, beta cohort, launch criteria, kill criteria.

## Business checklist
- [ ] Pricing model fits the value metric customers perceive (seats, usage, outcomes).
- [ ] Unit economics: gross margin per customer including infra and LLM costs; CAC payback.
- [ ] Competitive alternatives and why customers would switch.
- [ ] Roadmap items ranked by impact, confidence, and effort, with explicit trade-offs.

## Pitfalls
- Solution-first PRDs that never state the problem.
- KPIs that cannot be measured with current instrumentation.
- Usage-based pricing without cost ceilings for heavy users.
