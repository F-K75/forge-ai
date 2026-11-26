---
name: observability-monitoring
version: 1.0.0
domain: devops
description: Structured logging, metrics, distributed tracing, SLOs, and actionable alerting for production services.
keywords: [observability, monitoring, metrics, prometheus, grafana, tracing, opentelemetry, otel, structured logging, logs, alert, slo, sli, error budget]
dependencies: []
permissions: [read_repo]
departments: [infrastructure, engineering, delivery]
---
Instrument for the questions you will ask during an incident: what is broken, for whom, since when, and why - then alert only on user-visible symptoms.

## Checklist
- [ ] Emit structured JSON logs with timestamp, level, service, request id, and tenant/project id.
- [ ] Propagate a correlation/trace id across HTTP, queues, and background jobs.
- [ ] Expose RED metrics per endpoint: rate, errors, duration (histograms, not averages).
- [ ] Add saturation metrics: queue depth, worker utilization, connection pool usage.
- [ ] Trace cross-service calls with OpenTelemetry; include DB, cache, and LLM spans.
- [ ] Define SLIs and SLOs for key user journeys; alert on error-budget burn rate.
- [ ] Every alert links to a runbook and is actionable by the on-call person.
- [ ] Keep metric label cardinality bounded (no user ids or raw URLs as labels).
- [ ] Redact secrets and personal data from logs and traces.
- [ ] Build one service dashboard: traffic, errors, latency, saturation, recent deploys.

## Pitfalls
- Alerting on causes (CPU 80%) instead of symptoms (checkout errors).
- Logging full request bodies containing tokens or PII.
