---
name: incident-response-runbooks
version: 1.0.0
domain: devops
description: Incident triage, mitigation-first response, runbooks, on-call communication, and blameless postmortems.
keywords: [incident, outage, runbook, postmortem, post-mortem, on-call, sev1, sev2, pager, mitigat, root cause, downtime, rollback]
dependencies: [observability-monitoring]
permissions: [read_repo]
departments: [infrastructure, delivery]
---
Mitigate first, diagnose second: restore service with the safest reversible action, communicate on a fixed cadence, and turn every incident into durable fixes.

## During an incident
- [ ] Declare the incident, assign an incident commander, and open one channel.
- [ ] Assess impact: who is affected, which journeys, since when (check recent deploys first).
- [ ] Prefer reversible mitigations: rollback, feature flag off, scale up, fail over.
- [ ] Post status updates at a fixed cadence, even when there is no news.
- [ ] Keep a timestamped timeline of observations and actions.
- [ ] Confirm recovery with metrics, not with "seems fine".

## Runbooks
- [ ] Each alert links to a runbook: symptoms, dashboards, likely causes, safe commands.
- [ ] Commands in runbooks are copy-pasteable and tested.

## After
- [ ] Write a blameless postmortem within a few days: impact, timeline, contributing factors.
- [ ] Create owned, dated action items (detection, prevention, mitigation speed).
- [ ] Add regression tests or alerts so the same failure is caught earlier next time.

## Pitfalls
- Debugging root cause in production while users are still impacted.
- Postmortems that end with "be more careful" instead of system changes.
