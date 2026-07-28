# Infrastructure, Testing, Observability & DevOps Audit Report

**Repository:** forge-ai at `/workspace/a722b1a4-b01c-4cf9-bbd7-776c84b1848b`
**Audit Date:** 2026-07-28
**Scope:** Infrastructure, Testing, Observability, DevOps

---

## Findings

### INFRASTRUCTURE

#### F-INF-001 | CRITICAL | No Helm Charts | Missing
**Category:** Infrastructure
**Description:** The repository contains Kubernetes manifests in `k8s/` but no Helm charts (`Chart.yaml`, `values.yaml`). The k8s/README.md explicitly states these manifests are "not the live deploy path" and are not wired into CI/CD.
**Root Cause:** The project moved to Docker Compose over SSH before adopting Helm, and the k8s manifests were never maintained as a viable alternative.
**Business Impact:** If the team ever needs to move to Kubernetes, they must build Helm charts from scratch. The existing k8s manifests have drift (e.g., `GHCR_OWNER` placeholder, `latest` tags, missing orchestrator/frontend services).
**Technical Impact:** No templating, no value overrides, no dependency management for K8s deployments.
**Recommendation:** Either delete the stale k8s manifests or create a Helm chart that mirrors the Docker Compose production topology. If Kubernetes adoption is planned, start with a Helm chart now.
**Estimated Effort:** 3-5 days (create chart) or 0.5 days (delete stale manifests)
**Dependencies:** Decision on whether K8s is the target deploy path

#### F-INF-002 | CRITICAL | No Terraform / IaC | Missing
**Category:** Infrastructure
**Description:** No Terraform, Pulumi, CDK, or any IaC tooling exists. The entire infrastructure is defined in Docker Compose YAML files and manually-managed k8s manifests.
**Root Cause:** The project was built for a single-VPS Docker Compose deployment and never progressed to infrastructure-as-code.
**Business Impact:** Infrastructure cannot be reproduced programmatically. Every environment change is manual and error-prone. No version-controlled infrastructure state.
**Technical Impact:** No drift detection, no plan/apply workflow, no state management.
**Recommendation:** Adopt Terraform or Pulumi for the VPS infrastructure (networking, DNS, TLS, firewall rules). Start with the minimal set needed to provision the VPS and deploy the compose stack.
**Estimated Effort:** 5-10 days
**Dependencies:** Cloud provider choice, VPS provider API

#### F-INF-003 | HIGH | Production Docker Compose Missing Orchestrator and Frontend | Incomplete Topology
**Category:** Infrastructure
**Description:** `docker-compose.prod.yml` defines only `nginx`, `backend`, `worker`, `mongo`, `redis`, `certbot`, and `backup`. The `orchestrator` and `frontend` services are absent. The staging compose (`docker-compose.staging.yml`) also lacks both. Only the dev `docker-compose.yml` includes orchestrator and frontend.
**Root Cause:** The production/staging deployments rely on the nginx reverse proxy to serve the frontend static files and route to the orchestrator, but neither service is defined in the compose files. This means the orchestrator and frontend are either deployed separately or not deployed at all in prod/staging.
**Business Impact:** If the orchestrator and frontend are not running in production, the entire Review Board and frontend UI are unavailable. If they are deployed via a separate mechanism, that mechanism is undocumented.
**Technical Impact:** Incomplete service topology in compose files means `docker compose up` in prod/staging does not start all services. Health checks, resource limits, and restart policies are missing for services that should be there.
**Recommendation:** Add `orchestrator` and `frontend` services to `docker-compose.prod.yml` and `docker-compose.staging.yml`, or document the separate deployment mechanism.
**Estimated Effort:** 1-2 days
**Dependencies:** Clarify whether orchestrator/frontend are deployed separately

#### F-INF-004 | HIGH | No CDN Configuration | Missing
**Category:** Infrastructure
**Description:** No CDN (CloudFront, Cloudflare, etc.) configuration exists anywhere in the repository. The nginx reverse proxy serves static assets directly with a `Cache-Control: public, max-age=31536000, immutable` header for `/assets/`, but there is no CDN in front.
**Root Cause:** The project was designed for a single-VPS deployment without CDN.
**Business Impact:** No DDoS protection, no global edge caching, no WAF. Static assets are served directly from the VPS.
**Technical Impact:** No cache invalidation API, no CDN logs, no edge security rules.
**Recommendation:** Add a CDN (Cloudflare Free or CloudFront) in front of the nginx reverse proxy. Configure cache rules for static assets and API responses.
**Estimated Effort:** 2-3 days
**Dependencies:** CDN provider selection

#### F-INF-005 | HIGH | No Autoscaling in Production (Docker Compose) | Missing
**Category:** Infrastructure
**Description:** The production Docker Compose deployment has no autoscaling. Resource limits are set (CPU/memory) but there is no mechanism to scale services up or down based on load. The k8s manifests define HPA for backend, celery-worker, and orchestrator, but k8s is not the live deploy path.
**Root Cause:** Docker Compose does not support autoscaling. The project uses a single VPS.
**Business Impact:** Under heavy load, the backend and worker services will degrade or crash with no automatic recovery. Over-provisioning wastes money; under-provisioning causes outages.
**Technical Impact:** No horizontal scaling, no load-based capacity management.
**Recommendation:** Implement autoscaling at the VPS level (e.g., via a cloud provider's auto-scaling group) or migrate to Kubernetes where HPA is already defined. Alternatively, add a process monitor (e.g., supervisord) with scaling scripts.
**Estimated Effort:** 5-10 days (VPS auto-scaling) or 10-15 days (K8s migration)
**Dependencies:** Cloud provider, decision on deploy path

#### F-INF-006 | MEDIUM | No Ingress Controller Configuration for Docker Compose | Missing
**Category:** Infrastructure
**Description:** The nginx configuration in `deploy/nginx/templates/default.conf.template` is a basic reverse proxy with no rate limiting, no WAF rules, no request size limits beyond `client_max_body_size 10m`, and no DDoS protection.
**Root Cause:** Basic nginx configuration without security hardening.
**Business Impact:** The application is vulnerable to brute-force attacks, DDoS, and request-smuggling. No rate limiting on API endpoints.
**Technical Impact:** No protection against slowloris, no request size limits on API routes, no IP blocking.
**Recommendation:** Add rate limiting zones, request size limits per route, IP blocking, and slowloris protection to the nginx template. Consider adding ModSecurity or a WAF layer.
**Estimated Effort:** 2-3 days
**Dependencies:** None

#### F-INF-007 | MEDIUM | Backup S3 Upload Not Implemented | Stub
**Category:** Infrastructure
**Description:** The backup script in `k8s/mongodb-backup-cronjob.yaml` and `docker-compose.prod.yml` checks for `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_BUCKET` but only prints a message "S3 upload requires AWS CLI" rather than actually uploading. The `scripts/backup_mongodb.py` and `scripts/backup_verify.py` do not implement S3 sync.
**Root Cause:** S3 backup was designed but never implemented.
**Business Impact:** Backups are only stored locally on the VPS. If the VPS fails, all backups are lost. The 30-day local retention provides no offsite protection.
**Technical Impact:** No offsite backup, no cross-region replication, no immutable backup storage.
**Recommendation:** Implement S3 upload in the backup script using `aws s3 sync` or `boto3`. Add a custom backup image with AWS CLI pre-installed.
**Estimated Effort:** 2-3 days
**Dependencies:** AWS credentials, S3 bucket creation

#### F-INF-008 | MEDIUM | No Multi-Region Readiness | Missing
**Category:** Infrastructure
**Description:** The entire infrastructure is single-region: a single VPS, a single MongoDB instance (even in k8s it's a single StatefulSet with 3 replicas in one cluster), no cross-region replication, no failover to another region.
**Root Cause:** Single-VPS deployment model.
**Business Impact:** A regional outage (cloud provider, network partition) takes down the entire application with no failover.
**Technical Impact:** No disaster recovery across regions, no active-active or active-passive setup.
**Recommendation:** At minimum, implement MongoDB cross-region replication. For the application layer, consider a multi-region Docker Compose or Kubernetes deployment. This is a long-term goal.
**Estimated Effort:** 15-30 days (minimum viable multi-region)
**Dependencies:** Multi-region cloud infrastructure, DNS failover

#### F-INF-009 | LOW | No Service Mesh | Missing
**Category:** Infrastructure
**Description:** No service mesh (Istio, Linkerd, Consul Connect) exists. Service-to-service communication uses raw Redis/MongoDB URLs and HTTP proxying through nginx.
**Root Cause:** Single-VPS deployment with no need for service-to-service mTLS or observability at the network layer.
**Business Impact:** Low immediate impact, but as the service topology grows, lack of service mesh means no automatic mTLS, no traffic splitting, and no fine-grained observability between services.
**Technical Impact:** No mutual TLS between services, no circuit breaking at the network level, no traffic management.
**Recommendation:** Not urgent for current scale. Consider when moving to Kubernetes with multiple services.
**Estimated Effort:** N/A (deferred)
**Dependencies:** Kubernetes adoption

---

### TESTING

#### F-TST-001 | HIGH | No E2E Tests | Missing
**Category:** Testing
**Description:** The repository has 93 backend unit/integration test files and 7 frontend test files, but zero end-to-end tests. No Cypress, Playwright, or similar E2E framework is configured.
**Root Cause:** E2E testing was never implemented.
**Business Impact:** Critical user journeys (signup, login, build creation, deployment) are not validated end-to-end. Regressions in the full stack are invisible until production.
**Technical Impact:** No automated validation of the complete request path from frontend through API to database.
**Recommendation:** Add Playwright or Cypress E2E tests covering the critical user journeys. Start with 3-5 key flows.
**Estimated Effort:** 5-10 days
**Dependencies:** Test infrastructure setup, staging environment access

#### F-TST-002 | HIGH | No Load/Performance Tests | Missing
**Category:** Testing
**Description:** No load testing framework (k6, Locust, Artillery, Gatling) is configured. The `test_prompt_builder_perf.py` is a unit test, not a load test.
**Root Cause:** Performance testing was never implemented.
**Business Impact:** The application cannot handle traffic spikes gracefully. No baseline for capacity planning. No detection of performance regressions.
**Technical Impact:** No automated performance regression detection, no capacity planning data.
**Recommendation:** Add k6 or Locust load tests. Define baseline SLAs (e.g., p95 latency < 500ms for API endpoints, p99 < 2s) and run them in CI or against staging.
**Estimated Effort:** 3-5 days
**Dependencies:** Staging environment, load test tooling

#### F-TST-003 | HIGH | No Chaos Engineering Tests | Missing
**Category:** Testing
**Description:** No chaos engineering tests exist (no Chaos Monkey, Litmus, Gremlin, or custom chaos tests).
**Root Cause:** Chaos engineering was never implemented.
**Business Impact:** The resilience of the system under failure conditions is unknown. No validation of retry logic, circuit breakers, or graceful degradation.
**Technical Impact:** No automated validation of failure modes (Redis down, MongoDB primary loss, network partition).
**Recommendation:** Start with basic chaos experiments: kill MongoDB primary, block Redis, inject latency. Use the disaster recovery runbook as a guide.
**Estimated Effort:** 5-10 days
**Dependencies:** Staging environment, chaos tooling

#### F-TST-004 | MEDIUM | No Mutation Testing | Missing
**Category:** Testing
**Description:** No mutation testing (mutmut, Cosmic Ray, Stryker) is configured. The 60% coverage threshold may give false confidence.
**Root Cause:** Mutation testing was never implemented.
**Business Impact:** Tests may pass but not actually catch regressions if they only test happy paths or if assertions are weak.
**Technical Impact:** No measurement of test quality beyond line coverage.
**Recommendation:** Add mutmut to the backend test pipeline. Run it periodically (not in every CI run due to cost).
**Estimated Effort:** 2-3 days
**Dependencies:** None

#### F-TST-005 | MEDIUM | Orchestrator Tests Are Offline-Only | Limited Scope
**Category:** Testing
**Description:** The orchestrator tests (`orchestrator/tests/test_orchestrator.py`) explicitly state "No network and no MongoDB are required" and monkeypatch the LLM provider. This means the orchestrator's integration with real LLM providers, MongoDB, and Redis is never tested.
**Root Cause:** Tests are designed for speed and isolation, not for integration coverage.
**Business Impact:** LLM provider integration bugs, MongoDB query bugs, and Redis interaction bugs in the orchestrator will not be caught by tests.
**Technical Impact:** No integration test coverage for the orchestrator's core functionality.
**Recommendation:** Add integration tests for the orchestrator that test against real (or test) MongoDB/Redis and mock LLM providers with realistic responses.
**Estimated Effort:** 3-5 days
**Dependencies:** Test MongoDB/Redis setup

#### F-TST-006 | MEDIUM | Frontend Test Coverage Is Sparse | Limited Scope
**Category:** Testing
**Description:** Only 7 frontend test files exist for a large frontend codebase (~200+ source files). Key areas like the build pipeline, agent run panes, and WebSocket connections have no tests.
**Root Cause:** Frontend testing was added recently (the CI comment says "frontend had zero automated tests until this gate was added") but coverage is still thin.
**Business Impact:** Frontend regressions in critical UI flows (build, deploy, agent pipeline) are not caught by automated tests.
**Technical Impact:** Low frontend test coverage, no component-level testing for most UI components.
**Recommendation:** Expand frontend tests to cover the build pipeline, agent run flows, and WebSocket integration. Add component tests for key UI components.
**Estimated Effort:** 5-10 days
**Dependencies:** Test infrastructure, mock data setup

#### F-TST-007 | LOW | No Contract Tests for WebSocket Events | Missing
**Category:** Testing
**Description:** The frontend generates `wsEvents.ts` from the backend via `export_ws_events.py`, and there's a `wsContract.ts` file. However, there are no automated contract tests that verify the frontend and backend WebSocket event schemas stay in sync.
**Root Cause:** Contract testing was never implemented despite the infrastructure being in place.
**Business Impact:** A backend change to a WebSocket event schema could break the frontend without being caught until production.
**Technical Impact:** No automated validation of the frontend-backend WebSocket contract.
**Recommendation:** Add a contract test that validates the generated `wsEvents.ts` matches the backend's `WSEventType` definitions. The CI comment in `frontend/Dockerfile` already notes this risk.
**Estimated Effort:** 1-2 days
**Dependencies:** None

#### F-TST-008 | LOW | CI Test Mode Relaxes Production Validation | Risk
**Category:** Testing
**Description:** The CI test suite runs with `CI_TEST_MODE=1` and `TESTING=1`, which relaxes config validation in `core/config.py`. This means tests never validate that production configuration (Stripe live keys, replicaSet requirement, localhost guard) works correctly.
**Root Cause:** CI_TEST_MODE was added to allow the test suite to run without real secrets and a live MongoDB.
**Business Impact:** Production configuration bugs (e.g., missing replicaSet, localhost MongoDB URL in prod) are not caught by tests.
**Technical Impact:** Tests do not exercise the production configuration validation path.
**Recommendation:** Add a separate "production config validation" test that runs with real-seeming values and validates all production constraints. This already exists in CI as a smoke test step, but it should be a proper test, not a one-off Python command.
**Estimated Effort:** 1-2 days
**Dependencies:** None

---

### OBSERVABILITY

#### F-OBS-001 | CRITICAL | No Structured Logging | Missing
**Category:** Observability
**Description:** The backend uses Python's standard `logging` module with a plain text format: `%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s`. No JSON/structured logging, no log aggregation (ELK, Loki, Datadog), no log rotation configuration.
**Root Cause:** The project was built with simple console logging and never progressed to structured logging.
**Business Impact:** Logs cannot be efficiently searched, filtered, or analyzed at scale. In production, logs go to stdout of the Docker container and are not persisted or aggregated.
**Technical Impact:** No correlation of logs across services, no log-based alerting, no log retention policy, no log rotation (risk of disk exhaustion).
**Recommendation:** 1) Switch to structured JSON logging (e.g., `python-json-logger` or `structlog`). 2) Add log rotation (e.g., `RotatingFileHandler` or Docker log driver config). 3) Add a log aggregation solution (Loki + Grafana, ELK, or Datadog). 4) Include trace IDs in log lines for cross-service correlation.
**Estimated Effort:** 3-5 days (structured logging + rotation), 5-10 days (log aggregation)
**Dependencies:** Log aggregation platform selection

#### F-OBS-002 | CRITICAL | No Distributed Tracing | Missing
**Category:** Observability
**Description:** No OpenTelemetry, Jaeger, Zipkin, or any distributed tracing infrastructure exists. The backend has `sentry_sdk` for error tracking but no trace context propagation between services.
**Root Cause:** Tracing was never implemented.
**Business Impact:** When a request spans multiple services (frontend -> nginx -> backend -> MongoDB), there is no way to trace latency or failures across the full path. Root cause analysis for performance issues is severely hampered.
**Technical Impact:** No trace context propagation, no span instrumentation, no service dependency graph.
**Recommendation:** Implement OpenTelemetry tracing in the backend. Instrument FastAPI middleware, database calls, and LLM provider calls. Export to Jaeger or a managed tracing service.
**Estimated Effort:** 5-10 days
**Dependencies:** Tracing backend selection (Jaeger, AWS X-Ray, etc.)

#### F-OBS-003 | HIGH | Sentry tracesSampleRate Too Low | Misconfigured
**Category:** Observability
**Description:** Both backend (`main.py` line 169) and frontend (`sentry.ts` line 14) set `tracesSampleRate: 0.1` (10%). This means 90% of transactions are not sampled, making it very difficult to diagnose performance issues or trace errors across the full request path.
**Root Cause:** The 10% default was likely chosen to reduce Sentry costs, but it's too low for effective debugging.
**Business Impact:** Most errors and performance issues are invisible in Sentry. The error reporting coverage is only 10% of transactions.
**Technical Impact:** Low sampling rate means trace data is insufficient for root cause analysis.
**Recommendation:** Increase `tracesSampleRate` to at least 0.5 (50%) for production. Consider using Sentry's dynamic sampling rules to sample more aggressively for error transactions.
**Estimated Effort:** 1 hour (config change)
**Dependencies:** Sentry plan (higher sampling may cost more)

#### F-OBS-004 | HIGH | No SLOs or SLIs Defined | Missing
**Category:** Observability
**Description:** No Service Level Objectives (SLOs) or Service Level Indicators (SLIs) are defined anywhere in the repository. The Prometheus alert rules in `k8s/monitoring.yaml` define error rate and latency thresholds, but these are not formally tied to SLOs.
**Root Cause:** SLO/SLI framework was never implemented.
**Business Impact:** No formal reliability targets, no error budget tracking, no data-driven decisions about reliability investments.
**Technical Impact:** Alerting thresholds are arbitrary rather than derived from SLOs. No burn-rate alerting.
**Recommendation:** Define SLIs (e.g., availability, latency p95, error rate) and SLOs (e.g., 99.9% availability, p95 latency < 500ms). Implement error budget tracking and burn-rate alerting.
**Estimated Effort:** 3-5 days
**Dependencies:** SLO definition workshop with stakeholders

#### F-OBS-005 | MEDIUM | Orchestrator Has Zero Observability | Missing
**Category:** Observability
**Description:** The orchestrator service (`orchestrator/main.py`) has no metrics, no structured logging, no Sentry integration, no request ID middleware, and no health check beyond a basic `{"status": "ok"}`. The Dockerfile healthcheck uses `curl -f` on `/health` but the orchestrator has no `/metrics` endpoint.
**Root Cause:** The orchestrator was built as a standalone service without observability instrumentation.
**Business Impact:** When the orchestrator fails or degrades, there is no visibility into why. No metrics means no capacity planning or performance tracking.
**Technical Impact:** No Prometheus metrics, no structured logs, no error tracking, no request tracing.
**Recommendation:** Add Prometheus metrics to the orchestrator (at minimum: request count, latency, error rate). Add structured logging. Add Sentry integration. Add a `/metrics` endpoint.
**Estimated Effort:** 3-5 days
**Dependencies:** None

#### F-OBS-006 | MEDIUM | No Log Rotation in Docker Compose | Missing
**Category:** Observability
**Description:** The Docker Compose production configuration does not configure log rotation for any service. By default, Docker logs can grow unbounded and fill the VPS disk.
**Root Cause:** No log rotation policy was configured in the Docker Compose files.
**Business Impact:** Disk exhaustion on the VPS will cause all services to crash. No log retention for debugging historical issues.
**Technical Impact:** Unbounded log growth, no log persistence, no log archival.
**Recommendation:** Add `logging` configuration to all Docker Compose services with `max-size` and `max-file` limits. Consider shipping logs to a centralized system.
**Estimated Effort:** 1 day
**Dependencies:** None

#### F-OBS-007 | MEDIUM | Alertmanager Not Configured | Incomplete
**Category:** Observability
**Description:** The `k8s/prometheus-operator.yaml` deploys an Alertmanager instance but it has no configuration (no `config.yaml`, no receiver definitions, no route). The Prometheus rules in `k8s/monitoring.yaml` define alerts, but there is no Alertmanager config to route them to any notification channel.
**Root Cause:** Alertmanager was deployed but never configured.
**Business Impact:** Alerts defined in Prometheus rules are fired but never delivered to anyone. On-call engineers are not notified of incidents.
**Technical Impact:** Alertmanager exists but is a no-op. No PagerDuty, Slack, email, or webhook integration.
**Recommendation:** Configure Alertmanager with at least one receiver (email or Slack) and a route that matches the Prometheus alert rules.
**Estimated Effort:** 1-2 days
**Dependencies:** Notification channel setup

#### F-OBS-008 | MEDIUM | No Correlation Between Frontend and Backend Errors | Missing
**Category:** Observability
**Description:** The frontend uses Sentry for error tracking and the backend uses Sentry for error tracking, but there is no shared trace ID or request ID that links a frontend error to the corresponding backend request. The backend has request ID middleware (`request_id_middleware`) but it is not propagated to the frontend.
**Root Cause:** No trace ID propagation between frontend and backend.
**Business Impact:** When a user reports an error, engineers cannot easily trace it from the frontend through to the backend request. Debugging requires manual correlation.
**Technical Impact:** No end-to-end request tracing across the frontend-backend boundary.
**Recommendation:** Propagate the `X-Request-ID` header from the frontend to the backend (already done via nginx proxy headers). Include the request ID in Sentry breadcrumbs on both sides. Consider adding OpenTelemetry trace context propagation.
**Estimated Effort:** 1-2 days
**Dependencies:** None

#### F-OBS-009 | LOW | Audit Logs Are Append-Only but Not Queryable | Limited
**Category:** Observability
**Description:** The audit logging system (`core/audit.py`) inserts records into MongoDB but there is no admin UI, no API endpoint to query audit logs, and no retention policy for audit logs beyond the MongoDB TTL index (1 year).
**Root Cause:** Audit logging was implemented for compliance but not for operational use.
**Business Impact:** Security teams cannot easily query audit logs to investigate incidents. No dashboard for audit log analysis.
**Technical Impact:** Audit logs are stored but not accessible for operational monitoring or incident response.
**Recommendation:** Add an admin API endpoint for querying audit logs. Build a simple audit log dashboard in the admin console.
**Estimated Effort:** 2-3 days
**Dependencies:** None

#### F-OBS-010 | LOW | Grafana Dashboards Are ConfigMap-Based but May Not Be Loaded | Uncertain
**Category:** Observability
**Description:** The `k8s/grafana-dashboards-configmap.yaml` defines three Grafana dashboards as ConfigMap data. However, since the k8s manifests are not the live deploy path, these dashboards are not actively loaded into the running Grafana instance.
**Root Cause:** The dashboards are defined for a future K8s deployment that hasn't happened yet.
**Business Impact:** If the team moves to Kubernetes, they will need to verify these dashboards work. If they stay on Docker Compose, they need a different dashboard setup.
**Technical Impact:** Dashboards are defined but may not be functional in the current deployment.
**Recommendation:** Either wire the dashboards into the current deployment or remove them from the k8s directory and maintain them separately.
**Estimated Effort:** 0.5 days
**Dependencies:** Decision on deploy path

---

### DEVOPS

#### F-DevOps-001 | CRITICAL | Single-VPS Deployment with No Redundancy | Single Point of Failure
**Category:** DevOps
**Description:** The entire production deployment runs on a single VPS. There is no redundancy, no failover, no multi-AZ deployment. If the VPS goes down, the entire application is unavailable.
**Root Cause:** The project was built for a single-VPS deployment model.
**Business Impact:** A single hardware failure, network outage, or VPS provider issue takes down the entire application. No high availability.
**Technical Impact:** No failover, no load distribution, no resilience.
**Recommendation:** At minimum, deploy to two VPS instances behind a load balancer. For a more robust solution, migrate to a managed Kubernetes service with multi-AZ node pools.
**Estimated Effort:** 10-20 days (two VPS + LB) or 15-30 days (K8s migration)
**Dependencies:** Cloud provider, load balancer, DNS failover

#### F-DevOps-002 | HIGH | No Automated Rollback on Deploy Failure | Missing
**Category:** DevOps
**Description:** The deploy workflow (`deploy.yml`) does not have automated rollback. If a deployment fails the health check (`curl -fsS "https://$DOMAIN/api/health"`), the workflow does not automatically revert to the previous image tag. The `workflow_dispatch` input allows manual rollback by setting `image_tag` to a previous SHA, but this is a manual process.
**Root Cause:** No automated rollback logic was implemented in the deploy workflow.
**Business Impact:** A bad deployment stays live until someone manually intervenes. The health check step only verifies the new deployment is up, not that it's healthy.
**Technical Impact:** No automatic recovery from failed deployments, no deployment safety net.
**Recommendation:** Add automated rollback: if the post-deploy health check fails, automatically redeploy the previous `IMAGE_TAG`. Store the previous tag and use it as a fallback.
**Estimated Effort:** 2-3 days
**Dependencies:** None

#### F-DevOps-003 | HIGH | No Blue/Green or Canary Deployment Strategy | Missing
**Category:** DevOps
**Description:** The deployment process uses `docker compose up -d --remove-orphans` which performs a hard restart of all services. There is no blue/green deployment, canary rollout, or rolling update strategy for the Docker Compose path.
**Root Cause:** Docker Compose does not natively support rolling updates or blue/green deployments.
**Business Impact:** Every deployment causes downtime (services are stopped before the new ones start). No gradual rollout, no ability to test with a subset of traffic.
**Technical Impact:** No deployment safety, no traffic shifting, no instant rollback.
**Recommendation:** Implement a blue/green deployment strategy using two Docker Compose stacks (e.g., `forge` and `forge-green`) with a DNS switch or nginx upstream change. Alternatively, use a tool like `compose-green` or a custom script.
**Estimated Effort:** 5-10 days
**Dependencies:** DNS or load balancer configuration

#### F-DevOps-004 | HIGH | Environment Parity Gap Between Dev and Prod/Staging | Incomplete
**Category:** DevOps
**Description:** The dev environment (`docker-compose.yml`) includes `orchestrator` and `frontend` services, but the staging and production compose files do not. Staging is missing the orchestrator and frontend. Additionally, the dev environment uses `localhost` URLs while prod uses `https://$DOMAIN`. The `APP_ENV` is set to `production` in staging compose but the services are missing.
**Root Cause:** The staging and production compose files were created for a different deployment topology (nginx serving static frontend, backend API only).
**Business Impact:** Staging does not mirror production or development. Developers cannot validate the full stack in staging. The missing orchestrator in staging means the Review Board feature is not tested in staging.
**Technical Impact:** Environment drift between dev, staging, and prod. Staging tests do not cover the full architecture.
**Recommendation:** Align the staging compose file with the production topology (include orchestrator and frontend). Ensure all three environments have the same service topology with only configuration differences (URLs, domains, resource limits).
**Estimated Effort:** 2-3 days
**Dependencies:** Clarify whether orchestrator/frontend are deployed separately in prod

#### F-DevOps-005 | HIGH | Secrets Management Inconsistency | Fragmented
**Category:** DevOps
**Description:** The production Docker Compose path uses `.env` files with plain-text secrets on the VPS. The Kubernetes path references External Secrets Operator and Vault, but k8s is not the live deploy path. There is no unified secrets management strategy.
**Root Cause:** The project has two deployment paths (Docker Compose and Kubernetes) with different secrets management approaches, and only Docker Compose is live.
**Business Impact:** Secrets in `.env` files on the VPS are vulnerable to exposure. No rotation mechanism, no audit trail of secret access.
**Technical Impact:** Plain-text secrets on disk, no automatic rotation, no centralized secret management.
**Recommendation:** For the Docker Compose path, use a secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager) with a sidecar or init container to inject secrets. At minimum, restrict file permissions on `.env` files and implement a rotation script.
**Estimated Effort:** 3-5 days
**Dependencies:** Secrets manager selection

#### F-DevOps-006 | MEDIUM | No Database Migration in Deploy Pipeline | Missing
**Category:** DevOps
**Description:** The deploy workflow does not run database migrations as part of the deployment process. Migrations are handled by `core/migrations.py` at application startup (best-effort, non-fatal), but there is no explicit migration step in the CI/CD pipeline.
**Root Cause:** Migrations were designed to run at startup rather than as a separate deploy step.
**Business Impact:** If a migration fails at startup, the application starts with a partially migrated schema. No visibility into migration status before or after deployment.
**Technical Impact:** No migration rollback, no migration dry-run, no migration status reporting in CI.
**Recommendation:** Add an explicit migration step in the deploy pipeline that runs before the application starts. Add a migration dry-run in CI.
**Estimated Effort:** 2-3 days
**Dependencies:** None

#### F-DevOps-007 | MEDIUM | Deploy Workflow Uses `latest` Tag by Default | Risky
**Category:** DevOps
**Description:** The `deploy.yml` workflow builds and pushes images tagged `latest` and `${github.sha}`, but the `.env` file on the VPS defaults `IMAGE_TAG=latest`. If the deploy workflow is interrupted or the `IMAGE_TAG` sed command fails, the stack may run `latest` which could be a different image than what was just built.
**Root Cause:** The `IMAGE_TAG` default is `latest` in the `.env.example` and the compose files, and the deploy workflow only sets `IMAGE_TAG` via `sed` if the `.env` already has the variable.
**Business Impact:** Running `latest` in production means the deployed image may not match the built image, leading to inconsistent deployments.
**Technical Impact:** Non-reproducible deployments, difficulty debugging which image is running.
**Recommendation:** Always pin to a specific SHA in production. Never use `latest` in production. The deploy workflow should always set `IMAGE_TAG` to `${github.sha}` and verify it was applied.
**Estimated Effort:** 1 day
**Dependencies:** None

#### F-DevOps-008 | MEDIUM | No Infrastructure Drift Detection | Missing
**Category:** DevOps
**Description:** There is no mechanism to detect if the running infrastructure has drifted from the declared configuration. The VPS is managed manually, and there is no tool comparing the actual state to the desired state.
**Root Cause:** No IaC means no drift detection.
**Business Impact:** Manual changes to the VPS (package updates, config changes, firewall rules) can cause inconsistencies between environments and lead to outages.
**Technical Impact:** No drift detection, no configuration compliance checking.
**Recommendation:** Implement infrastructure drift detection. If using Docker Compose, use `docker compose config` to validate the compose files. If moving to Terraform, use `terraform plan` in CI to detect drift.
**Estimated Effort:** 1-2 days
**Dependencies:** None

#### F-DevOps-009 | LOW | No Post-Deployment Smoke Tests | Missing
**Category:** DevOps
**Description:** The deploy workflow runs a single health check (`curl -fsS "https://$DOMAIN/api/health"`) after deployment. This only verifies the backend is up, not that the full stack (frontend, orchestrator, database, Redis) is functional.
**Root Cause:** Only a basic health check was implemented.
**Business Impact:** A deployment that passes the health check but has broken functionality (e.g., database connection, Redis cache, LLM provider integration) will not be caught.
**Technical Impact:** No post-deployment validation of full-stack functionality.
**Recommendation:** Add post-deployment smoke tests that exercise critical paths: API health, database connectivity, Redis connectivity, and a sample build/LLM request.
**Estimated Effort:** 2-3 days
**Dependencies:** None

#### F-DevOps-010 | LOW | No Deployment Audit Trail | Missing
**Category:** DevOps
**Description:** There is no record of who deployed what, when, or why. The deploy workflow does not log deployment details to an audit system, and there is no deployment history dashboard.
**Root Cause:** No deployment audit logging was implemented.
**Business Impact:** When an incident occurs, there is no way to quickly determine what was recently deployed. No accountability for deployment changes.
**Technical Impact:** No deployment audit trail, no change management visibility.
**Recommendation:** Log deployment events (who, what, when, which image tag) to an audit log or at minimum to a deployment history file on the VPS. Consider integrating with Slack/email notifications for deployments.
**Estimated Effort:** 1 day
**Dependencies:** None

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 8 |
| MEDIUM | 7 |
| LOW | 5 |
| **Total** | **25** |

### Top 5 Critical Findings
1. **F-INF-001**: No Helm charts — k8s manifests are stale and not the live deploy path
2. **F-INF-002**: No Terraform/IaC — infrastructure cannot be reproduced programmatically
3. **F-INF-003**: Production compose missing orchestrator and frontend services
4. **F-OBS-001**: No structured logging — logs are plain text, unaggregated, unrotated
5. **F-DevOps-001**: Single-VPS deployment with no redundancy — single point of failure

### Top 5 High Findings
1. **F-INF-004**: No CDN — no DDoS protection, no edge caching
2. **F-INF-005**: No autoscaling in production — services cannot scale with load
3. **F-TST-001**: No E2E tests — critical user journeys are not validated end-to-end
4. **F-TST-002**: No load tests — no performance baseline or regression detection
5. **F-OBS-003**: Sentry tracesSampleRate at 10% — 90% of transactions are invisible
