---
name: product-analytics-experiments
version: 1.0.0
domain: product_business
description: Product metrics, event tracking plans, funnels, cohort retention, and statistically sound A/B experiments.
keywords: [a/b test, ab test, experiment, funnel, retention, activation, cohort, product analytics, conversion, north star, churn, tracking plan, event tracking]
dependencies: [prd-product-strategy]
permissions: [read_repo]
departments: [business, leadership]
---
Decide what you will measure and what result would change your decision before shipping, then instrument it and read results honestly.

## Metrics & tracking
- [ ] Define a north-star metric plus input metrics the team can move.
- [ ] Write a tracking plan: event names (`object_action`), properties, owner, and purpose.
- [ ] Track server-side for business-critical events (signup, purchase) to avoid ad-blocker loss.
- [ ] Exclude internal, test, and bot traffic.
- [ ] Respect consent and avoid sending PII in event properties.

## Experiments
- [ ] Write a hypothesis, primary metric, guardrails, and minimum detectable effect up front.
- [ ] Compute sample size and run duration before launch; run full weekly cycles.
- [ ] Randomize at the right unit (user, account) and check for sample ratio mismatch.
- [ ] Do not peek and stop early on a lucky p-value; use pre-set stopping rules.
- [ ] Report effect size with confidence intervals, plus segment checks for harm.
- [ ] Record the decision and learning in an experiment log.

## Pitfalls
- Vanity metrics (page views) standing in for value delivered.
- Changing the metric definition after seeing results.
