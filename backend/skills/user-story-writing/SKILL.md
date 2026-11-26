---
name: user-story-writing
version: 1.0.0
domain: product_business
description: Backlog-ready user stories and epics with testable acceptance criteria, sizing, and clear definitions of done.
keywords: [user story, user stories, acceptance criteria, backlog, epic, gherkin, given/when/then, ticket, definition of done, sprint, story points, spec]
dependencies: [prd-product-strategy]
permissions: [read_repo]
departments: [business, leadership]
---
Write stories small enough to ship in a few days, from the user's point of view, with acceptance criteria an engineer and a tester can verify without asking.

## Checklist
- [ ] Format: "As a <persona>, I want <capability>, so that <outcome>".
- [ ] Each story is independent, negotiable, valuable, estimable, small, and testable (INVEST).
- [ ] Acceptance criteria use Given/When/Then and cover happy path, edge cases, and errors.
- [ ] Include permissions: who can and cannot perform the action.
- [ ] Note non-functional needs: performance, accessibility, analytics events, audit logging.
- [ ] Link designs, API contracts, and the parent epic/PRD.
- [ ] List explicit out-of-scope items to prevent scope creep.
- [ ] Split large stories by workflow step, data variation, or user role, not by technical layer.
- [ ] Define done: merged, tested, documented, behind a flag or released, metrics visible.

## Pitfalls
- "Technical stories" with no user-visible outcome; attach them to the story they enable.
- Acceptance criteria that restate the title ("user can export") without observable results.
