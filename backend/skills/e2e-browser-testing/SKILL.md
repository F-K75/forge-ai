---
name: e2e-browser-testing
version: 1.0.0
domain: quality_engineering
description: Playwright/Cypress end-to-end tests for critical user journeys with resilient selectors, seeded data, and visual checks.
keywords: [e2e, end-to-end, playwright, cypress, browser test, ui test, user journey, selector, visual regression, screenshot]
dependencies: [automated-qa-verification]
permissions: [read_repo, run_tests]
departments: [quality, engineering]
---
Reserve E2E tests for critical user journeys, make each one independent and data-seeded, and select elements the way users find them.

## Checklist
- [ ] List the top journeys (sign up, log in, core create/edit flow, checkout) and cover those first.
- [ ] Select by role, label, or text (`getByRole`, `getByLabel`), falling back to `data-testid`.
- [ ] Seed test data via API or fixtures per test; do not depend on previous tests.
- [ ] Authenticate once and reuse storage state instead of logging in through the UI each time.
- [ ] Use auto-waiting assertions (`expect(locator).toBeVisible()`); never fixed sleeps.
- [ ] Stub third-party services (payments, email, LLMs) at the network layer.
- [ ] Capture trace, video, and screenshots on failure for debugging.
- [ ] Run against a production-like build, not the dev server with hot reload.
- [ ] Add visual regression checks only for stable, high-value screens.
- [ ] Test at least one mobile viewport for responsive journeys.

## Pitfalls
- Asserting on CSS classes or DOM structure that changes with every refactor.
- Large suites of E2E tests for logic that unit tests could cover faster.
