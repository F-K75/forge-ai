# Forge Scalability & Architecture Due Diligence — TODO

## Step 0: Gather evidence for architecture
- [x] Read high-level architecture docs (README, DEPLOYMENT, PLATFORM_ARCHITECTURE, PRODUCTION_AUDIT_REPORT)
- [x] Read core infra manifests (docker-compose prod, k8s backend/frontend/ingress/redis/celery, mongodb)
- [x] Read backend core entrypoints and major runtime components (main.py, ai_usage.py, ws_manager.py, celery_app.py)
- [x] Read build pipeline and Celery tasks (api/builds.py, tasks/build_tasks.py)
- [x] Read database connection/pooling + index provisioning (core/database.py)
- [x] Read security/rate-limiting + CSRF implementation (core/security.py)
- [x] Read config and data models for scaling-sensitive fields (core/config.py, core/models.py)

## Step 1: Create comprehensive architecture diagram + service list
- [x] Produce architecture diagram (ASCII) covering FE, API, WebSockets, Celery, Mongo, Redis, artifact storage (if any)
- [x] Enumerate all services: orchestration/review board (if used in prod), sandbox, orchestration engine, integrations/tools


## Step 2: Milestone scalability capacity review (100/1k/10k/100k/1M)
- [ ] Determine what breaks first for each milestone (CPU, memory, LLM cost, DB, WS, queues)
- [ ] Produce quantified assumptions for RPS / concurrent WS / build duration / token budgets

## Step 2 (service-by-service): completion tracking
- [x] Finish Step 2 service-by-service audit (purpose/deps/criticality/scalability/failure impact)

## Step 3: Database audit
- [x] Create Step 3 database audit report (evidence-based)

## Step 3: Service-by-service audit

- [x] Backend API service (statelessness, worker model, middleware cost, rate limiting)
- [ ] Celery worker (queue depth, concurrency, build timeouts, cancellation)
- [x] WebSocket manager (connection lifecycle, pub/sub fanout, max payload)
- [ ] MongoDB (indexes, document sizes, TTL, aggregation patterns)
- [ ] Redis (connection limits, pub/sub, fallback behaviors)
- [ ] AI pipeline/orchestration (max parallelism, retries, token budgeting)

## Step 4: API Scalability audit
- [x] Create Step 4 API scalability audit report (evidence-based)

## Step 4: Observability, reliability, infra readiness


- [ ] Logging/metrics/tracing review (what exists; what’s missing for autoscaling)
- [ ] Failure recovery & graceful shutdown (Mongo/Redis/Celery/WS)
- [ ] Backup/DR gap checks

## Step 5: Engineering blockers list and roadmap
- [ ] Rank P0/P1/P2 blockers by impact/effort with exact file evidence
- [ ] Roadmap from prototype→beta→launch→10k→100k→1M

## Step 6: Final report
- [ ] Produce final scorecard and verdict, evidence-backed and quant/assumption-based

