# Step 2 — Service-by-service audit (scalability & reliability)

> Evidence-based review board report. This document focuses strictly on scalability, architecture, reliability, and operational readiness (no UI quality, no business strategy).

## Summary of the runtime pathways covered
- **User-facing builds**:
  - Create build: `backend/api/builds.py:create_build`
  - Execute build: `backend/tasks/build_tasks.py:run_build` → `backend/core/orchestrator.py:run_build`
  - Stream build state: `backend/api/builds.py:websocket_endpoint` → `backend/services/ws_manager.py`
- **Agile/initiative agent execution (non-build pipeline)**:
  - Create/execute tasks: `backend/api/tasks.py` → `backend/tasks/pm_tasks.py`
  - Dashboard reads: `backend/api/agent_executions.py`
  - WS fanout for initiatives: `backend/services/pm_ws_manager.py` (Redis pub/sub)
- **Deployments** (server-side Docker builds/runs): `backend/api/deployments.py`

---

## 1) Backend API (FastAPI)

### Purpose
Stateless-ish HTTP API for:
- Auth/session + CSRF
- Projects and builds CRUD
- Billing/Stripe routes
- Marketplace/support/admin/analytics/etc (routers mounted in `backend/main.py`)
- WebSocket upgrade endpoint for build streaming (`/builds/ws/{build_id}`)

### Dependencies
- MongoDB (Motor) via `backend/core/database.py`
- Redis for rate limiting + CSRF token storage + WS fanout
- Celery workers indirectly (builds delegated to Celery)
- WebSocket managers in-process (`backend/services/ws_manager.py`, `backend/services/pm_ws_manager.py`)

### Criticality
**Critical** (front door for all user traffic + WS handshake).

### Single point of failure (SPOF)
- In each pod instance: the in-memory `ConnectionManager.active` is local, but Redis pub/sub mitigates cross-instance delivery.
- More importantly, deployment exposes backend behind a single ingress host; outage of the backend deployment halts all builds and API.

Evidence:
- WS manager uses local active connections + Redis pub/sub bridging (`backend/services/ws_manager.py`).

### Horizontal scalability
- K8s supports multiple replicas: `k8s/backend.yaml` has `replicas: 3` with HPA `maxReplicas: 20`.
- WS fanout uses Redis pub/sub (`build:{build_id}` channels) so multiple backend instances can serve many WS connections.

### Vertical scalability
- CPU/memory limits exist: `requests memory 1Gi / limits 2Gi / cpu 500m / limits 2000m`.

### Statelessness
- **Mostly stateless** for HTTP: uses Mongo/Redis.
- **Not fully stateless for WS** because `ConnectionManager.active` is in-memory per process, but cross-instance delivery is supported via Redis pub/sub.

### Thread-safe / async-safe
- Async-safe: uses asyncio + await everywhere in handlers.
- Thread safety risk: `backend/api/builds.py` instantiates `orchestrator = Orchestrator()` at module import time; however actual orchestration is executed in Celery workers (see below). The API primarily enqueues Celery tasks.

### Estimated max throughput
Constrained by:
- WS connection count (per pod) due to open sockets, plus pub/sub listener overhead.
- HTTP request concurrency in FastAPI/uvicorn.

**Evidence-based hard limits known from code/config**:
- WS payload cap: `MAX_WS_PAYLOAD_BYTES = 5 * 1024 * 1024` (`backend/services/ws_manager.py`).
- WS auth timeout: 10s.

**Practical estimate** (assumption):
- For 100 concurrent users, throughput is mostly rate-limited by build creation & WS events; API pods at 2Gi/CPU 2 cores can likely sustain it.
- For 10k+ concurrent active WS connections, each pod’s in-memory connection list and event-loop overhead becomes dominant; capacity will be driven by network sockets and Redis pub/sub throughput.

Because this report must be numeric, and the repo does not provide explicit per-pod WS connection limits, the “estimated max throughput” is instead expressed as the dominant bottleneck:
- **WS event throughput** is limited by: Redis pub/sub + per-event serialization and per-connection `ws.send_text()` loops in `_deliver_local()`.

### Failure impact
- If a backend pod dies:
  - existing WS connections drop until reconnect.
  - HTTP traffic fails for its shard.
- If Redis is down:
  - Rate limiting fallback exists, but WS pub/sub fanout will degrade (publish skipped on errors, but local delivery still works only for events emitted in same process).

Evidence:
- `backend/services/ws_manager.py::_publish`: does `await _deliver_local(...)` then attempts `redis.publish`; exceptions are swallowed.

---

## 2) WebSocket Build Streaming (ConnectionManager)

### Purpose
- Maintain active WS connections per `build_id`.
- Bridge build events from Celery worker processes (which do not hold WS connections) to FastAPI pods via Redis pub/sub.

### Dependencies
- Redis pub/sub via `redis.pubsub().psubscribe('build:*')`.
- Mongo (only during authentication to validate build access) via `backend/services/ws_manager.py:get_ws_user` / `authenticate_websocket`.

### Criticality
**Critical** for build UX and for long-running builds (hundreds of seconds).

### SPOF (and what prevents it)
- SPOF *within a single process*: the active connection map.
- SPOF avoided *across processes*: Redis bridging.

### Horizontal scalability
- Redis pub/sub pattern subscription `build:*` enables N backend pods to each receive messages and deliver locally.
- Multiple WS connections per build supported via `self.active.setdefault(build_id, []).append(websocket)`.

### Vertical scalability
- Per-pod memory usage grows with WS connections.

### Statelessness
- Active WS connections are stateful per process.

### Thread-safe / async-safe
- Uses async websocket `send_text` in a loop.
- No explicit locks around `self.active`; however all modifications happen within the event loop thread for that instance (typical uvicorn single-threaded async model). Under uvicorn multi-worker, state is per process.

### Estimated max throughput
Determinants:
- `_deliver_local` iterates all connections in `self.active[build_id]` and sends each payload.
- Pub/sub listener parses envelopes and re-delivers.

Evidence constraints:
- Max payload 5MB: drops oversized messages.

**Failure under heavy load prediction**:
- When many build events are emitted concurrently, `_deliver_local` becomes CPU-bound due to repeated JSON serialization + per-connection writes.
- Because each worker emits many events (see orchestrator below), WS event volume can be high.

### Failure impact
- If Redis pub/sub listener fails or cannot connect:
  - Build events from other pods/worker processes are not delivered.
- All connection drops cause clients to reconnect; repeated authentication (Mongo reads) adds DB load.

---

## 3) Celery Workers (Build pipeline)

### Purpose
Execute asynchronous build tasks:
- `backend/tasks/build_tasks.py:run_build`

### Dependencies
- MongoDB for reading build state and writing build updates + `build_files`.
- Redis for Celery broker/result backend and for WS events delivery (indirectly, via ws_manager publish).
- Sandbox runner (Python/TS checks) during orchestrator execution.
- LLM providers via `backend/agents/base.py`.

### Criticality
**Critical**: build completion, refunds, credits ledger updates.

### SPOF
- **Queue depth / worker pool capacity** is the bottleneck. If build queue backs up, builds stall and credits are reserved.
- Celery worker “stuck pipeline” is mitigated by `soft_time_limit/time_limit`.

Evidence:
- Celery task config in `backend/tasks/build_tasks.py:run_build` uses:
  - `soft_time_limit=settings.build_timeout` (default from config: 600)
  - `time_limit=settings.build_timeout + 30`

### Horizontal scalability
- K8s: `k8s/celery-worker.yaml`:
  - `replicas: 2`, HPA max 10 using external metric `celery_queue_depth` targeting value "10".
- Celery concurrency:
  - Compose/entry: k8s uses `--concurrency 4 --max-tasks-per-child 100` (from `k8s/celery-worker.yaml`).

### Vertical scalability
- Worker pod resources: requests 2Gi memory / limits 4Gi, cpu up to 3000m.

### Statelessness
- Worker tasks are stateless across tasks, but there are process-global singletons:
  - `_worker_loop` reused per worker process.
  - Mongo client singleton in `backend/core/database.py`.
  - `orchestrator = Orchestrator()` global.

### Thread-safe / async-safe
- Uses a single event loop per worker process:
  - `_run_async()` creates or reuses `_worker_loop`.
- Async-safety depends on global objects being safe across tasks:
  - `core/database.get_db()` uses Motor client bound to loop but reused consistently.
  - LLM clients in agents are module-level singletons in `backend/agents/base.py`, but `_resolve_client()` creates per-call client when BYOK is active; default Forge client is used when BYOK is inactive.

Evidence:
- `backend/agents/base.py::_resolve_client` explicitly warns about shared clients and returns fresh clients where needed.

### Estimated max throughput
Build pipeline throughput is dominated by **LLM call latency**.

Evidence:
- Orchestrator sequential agent stages in `backend/core/orchestrator.py`:
  - Architect → Business Model → Designer → Developer (streaming) → Integration (conditional) → PM loop (+ Debugger loop up to `MAX_DEBUG_ITERATIONS=3`).
- Each build performs multiple LLM calls; PM validation can trigger up to 3 additional debug iterations.

Therefore, estimated throughput per worker is approximately:
- `1 build / (sum of LLM latencies across agents * (1 + debug_loop_fraction))`
- Since actual token/latency not measurable from repo, use structural hard limits:
  - max debug iterations = 3 (`core/orchestrator.py`).
  - build timeout max = 600 seconds soft.

So a hard upper bound per worker execution slot:
- **At most** one build task can “consume” a concurrency slot for up to 600s.

Given `--concurrency 4` per worker pod (k8s):
- max concurrent build tasks per pod ≈ 4.
- cluster max concurrent build tasks = pods * 4 (with pods up to HPA maxReplicas 10).

So structural max concurrency:
- Min pods 2 → 8 concurrent builds.
- Max pods 10 → 40 concurrent builds.

### Failure impact
- SoftTimeLimitExceeded:
  - refunds credits and marks build FAILED (but no retry due to non-resumable pipeline).
- Other exceptions:
  - partial retry semantics: retries only if no agent succeeded yet.

Evidence:
- `backend/tasks/build_tasks.py`:
  - retries only when `made_progress` is false and retries remain.
  - credits refund logic on terminal paths.

---

## 4) AI Orchestration (Orchestrator + Agent pipeline)

### Purpose
Run the full multi-agent build workflow in-process within a Celery build task:
- `backend/core/orchestrator.py:run_build`

### Dependencies
- Individual agents:
  - `backend/agents/architect.py`
  - `backend/agents/business_model.py`
  - `backend/agents/designer.py`
  - `backend/agents/developer.py`
  - `backend/agents/integration.py`
  - `backend/agents/pm.py`
  - plus debugger path via `developer.patch_files()` in the loop.
- LLM calls: `backend/agents/base.py`.
- Sandbox runner (optional): `backend/sandbox/runner.py`.
- Build credit tracking and BYOK check uses Mongo.
- WS event emission uses `emit()` passed from Celery task.

### Criticality
**Critical** (dominates build time + LLM cost).

### SPOF
- LLM provider unavailability is a functional SPOF for build completion.
- Single-thread within each build task is a latency SPOF: agents run sequentially.

Evidence:
- Orchestrator executes agents sequentially with `await`.

### Horizontal scalability
- Builds scale horizontally via Celery worker concurrency.
- Orchestrator instances are per-process but builds run concurrently across Celery slots.

### Vertical scalability
- No internal parallelism: each build task is primarily sequential.

### Statelessness / thread-safety / async-safety
- Orchestrator itself holds agent instances (`self.architect`, `self.designer`, etc.) created in `__init__`.
- These agent instances share BaseAgent module-level LLM clients; BYOK keys are resolved per call to avoid cross-user leakage.

Evidence:
- `backend/api/builds.py` uses module-level `orchestrator = Orchestrator()` and Celery executes orchestrator calls.
- `backend/agents/base.py::_resolve_client` avoids mutating shared clients for BYOK.

### Estimated max throughput
Structural concurrency per build:
- Orchestrator is sequential; thus throughput scales linearly with concurrent builds, not with micro-parallelism.

Hard caps:
- `MAX_DEBUG_ITERATIONS = 3`
- Build timeout: `settings.build_timeout = 600` seconds (`backend/core/config.py`).

LLM streaming in developer stage:
- `developer.generate_files()` calls `BaseAgent.stream()` when `stream_callback` provided.

### Failure impact
- Any agent failure causes build FAILED in orchestrator exception handler.
- PM validation failures cause debug loop, increasing cost/time.

---

## 5) Sandbox Runner (best-effort checks)

### Purpose
Perform lightweight validation on generated files:
- Python syntax via `python3 -m py_compile`
- TS “basic braces” check (not full tsc)
- Runs inside the build Celery task (best-effort)

### Dependencies
- Local filesystem temp directory.

### Criticality
**Medium to low** for scalability (it is fast), but **medium** for reliability (it can miss issues; PM loop compensates).

### SPOF
- Not a central SPOF; errors propagate only as strings returned. Orchestrator uses these errors to decide PM loop.

Evidence:
- `backend/sandbox/runner.py` returns error string; orchestrator sets `sandbox_errors`.

### Horizontal scalability
- Each build task performs sandbox checks independently; scales with worker slots.

### Thread-safe / async-safe
- Uses `tempfile.TemporaryDirectory()`; local per invocation.

### Estimated max throughput
Dominated by:
- number of generated Python/TS files.
- each python check has a `timeout=10` per subprocess.

### Failure impact
- If sandbox crashes, orchestrator behavior depends on whether `sandbox_runner` is provided and error handling; by code structure it can’t crash without raising; but orchestrator doesn’t wrap sandbox call in try/except, so a sandbox exception would fail the build.

---

## 6) MongoDB (primary persistence)

### Purpose
Store all platform state:
- users, projects, builds
- `build_files` artifacts (TTL)
- credits/billing state
- rate limiting keys (optional)
- analytics/events/security logs
- deployments
- agile PM layer collections (`initiatives`, `tasks`, `agent_executions`, etc.)

### Dependencies
- Motor async client with pooling.
- Mongo indexes/TTLs provisioned on first connection in `backend/core/database.py`.

### Criticality
**Critical** for every request and for build completion.

### SPOF
- Mongo outage blocks API reads/writes and breaks build execution.

### Horizontal scalability
- Not horizontally scalable within a single replica set without sharding.
- K8s uses `StatefulSet` with `replicas: 3` and replicaSet `rs0` (see `k8s/mongodb.yaml`).

### Vertical scalability
- Vertical scaling via pod CPU/memory.

### Indexing & TTL readiness
Evidence from `backend/core/database.py`:
- Builds indexes:
  - `builds` on `(project_id, user_id, created_at desc)`
  - `builds` on `id`
- `build_files` TTL 90 days:
  - `expireAfterSeconds=7776000`
- Many other indexes for rate limiting, audit logs, notifications, etc.

### Query patterns & N+1 risk
Evidence in API snippets:
- Some list endpoints use `to_list(None)` and skip/limit; manageable.
- `backend/api/projects.py:get_project_builds` queries `db.builds` excluding `files` field.

### Connection pooling
- Motor client uses `maxPoolSize=50`, `minPoolSize=10`.
- Wait queue timeout `waitQueueTimeoutMS=10000` and connect timeout `connectTimeoutMS=10000`.

### Estimated maximum sustainable load
Dominated by:
- build write amplification:
  - `run_build` updates build document multiple times and writes build_files at completion.
- frequent build status updates via REST fallback plus WS events.

From code:
- In `backend/tasks/build_tasks.py:emit`, it updates build doc with:
  - `status`, `agents`, `credits_used`, `business_model`
  - then emits WS event.

Since orchestrator emits many events, Mongo write rate can be high.

Therefore the DB can become the bottleneck before LLM:
- Each WS event emission triggers a Mongo `update_one`.

### Failure impact
- Mongo latency increases WS event persistence overhead, slowing build tasks and increasing queue depth.

---

## 7) Redis (cache + pub/sub + Celery broker)

### Purpose
- Celery broker and result backend (`backend/celery_app.py`)
- WS pub/sub for builds: channels `build:{build_id}` pattern `build:*`
- CSRF token storage in Redis
- Rate limiting counters

### Dependencies
- Redis K8s deployment `k8s/redis.yaml` plus sentinel deployment in same file.

### Criticality
**Critical** (broker/result backend and WS pub/sub).

### SPOF
- Redis unavailable breaks:
  - Celery queueing/execution
  - WS cross-instance delivery
  - CSRF token storage/validation
  - rate limiting (but fallback exists)

Evidence:
- `backend/core/security.py:rate_limit_middleware` falls back to in-memory when Redis ping fails.
- CSRF uses Redis token storage via `store_csrf_token()` and `validate_csrf_token()`; failures return False.

### Horizontal scalability
- Redis sentinel suggests HA, but the code uses a single `settings.redis_url`.
- Redis scalability beyond single instance not supported by code.

### Vertical scalability
- Redis pod limits exist.

### Estimated throughput
Dominated by:
- Pub/sub fanout: each build emits many events to Redis.
- Celery broker traffic: task enqueue/dequeue and results.

### Failure impact
- If Redis fails:
  - WS from workers to clients becomes incomplete.
  - API rate limiting uses in-memory fallback (less reliable and not fail-closed globally across pods).

---

## 8) Deployments service (Docker-based)

### Purpose
Run user-deployed app instances by:
- creating a Docker image from generated files (Dockerfile inference)
- running a container mapped to a computed host port
- updating deployment state in Mongo
- streaming logs/status via build WS manager (`services/ws_manager.py:manager`)

### Dependencies
- Local Docker engine on the backend host/pod (via `docker.from_env()`)
- MongoDB
- WS manager

### Criticality
**High operational risk**, but not on the critical path of build completion.

### SPOF
- **Hard SPOF**: the Docker daemon + host networking model.
  - It assumes the backend can build and run containers and that `settings.deployment_host` reaches containers.

Evidence:
- `backend/api/deployments.py:_run_deployment_background` uses `client.api.build(...)` and `client.containers.run(...)`.
- URL computed as `http://{settings.deployment_host}:{port}`.

### Horizontal scalability
- Not horizontally scalable with multiple backend pods unless each pod has:
  - access to the Docker daemon,
  - shared networking for ports.
- K8s production manifests likely do not mount Docker socket (DEPLOYMENT.md notes this feature stays dark without docker socket).

### Vertical scalability
- Limited by host CPU/memory, and by Docker build cache.

### Thread-safe / async-safe
- Uses `asyncio.to_thread(build_and_run)` to run Docker operations in thread.

### Estimated max throughput
- Deployment builds are extremely expensive in CPU and IO.
- With concurrency, multiple deployments will starve worker/build pipeline.

Given this is not the main build path, its throughput is bounded by host Docker capacity, not by code.

### Failure impact
- If deployments fail, it affects only deployments but can still add DB load and WS noise.

---

## 9) Agile PM Layer task execution (Celery PM tasks)

### Purpose
Non-build pipeline that executes “tasks” within an initiative using AI:
- Generate initiative plan
- Execute task with a scoped TaskExecutorAgent
- Run decision engine

### Dependencies
- MongoDB
- Redis via Celery broker/result backend
- PM WS manager via Redis pub/sub (`pm_manager.emit`)
- LLM via `backend/agents/*` (TaskExecutorAgent inherits BaseAgent)

### Criticality
- High for PM feature, but not required for core “build” product path.

### SPOF
- LLM provider availability and Celery queue capacity.

### Horizontal scalability
- Worker scaling for PM tasks shares the same `celery-worker` deployment with queue routing on `build` and uses the same Celery worker image.

Evidence:
- `backend/celery_app.py:task_routes` routes pm_tasks.* to queue `build`.

So PM traffic contends for the same build worker pool.

### Statelessness / async safety
- Same pattern as build tasks: uses `_run_async` per worker process and persists nothing in memory except event loop.

### Estimated max throughput
Bound by the same worker concurrency slots as builds, since PM tasks share queue:
- `k8s/celery-worker.yaml` concurrency=4 per worker pod.

Additionally, PM tasks include:
- initiative plan generation (could be long)
- task execution (TaskExecutorAgent uses `BaseAgent.run`, which does a single LLM call + JSON parse)

### Failure impact
- No retries (`max_retries=0`) in PMTask.
- Failures mark tasks BLOCKED and update agent_executions to FAILED.

---

# Step-2-specific cross-cutting bottlenecks (evidence-based)

## Bottleneck A — Build event emission triggers Mongo updates
Evidence:
- `backend/tasks/build_tasks.py:emit` does:
  - `await db.builds.update_one(...)` before `await manager.emit(event)`
- Orchestrator emits many WS events (agent start/complete, progress, stream tokens, file updates, build complete).

Impact:
- High build concurrency multiplies Mongo write load and increases latency per event.

## Bottleneck B — Redis pub/sub and WS delivery fan-out
Evidence:
- `ws_manager.start_pubsub_listener()` listens to `build:*` and calls `_deliver_local`.
- `_deliver_local` loops through all connections for a build.

Impact:
- Many simultaneous builds with multiple observers per build amplifies per-event work.

## Bottleneck C — Celery queue sharing across build and PM tasks
Evidence:
- `backend/celery_app.py` routes both build and pm_tasks.* into queue "build".

Impact:
- PM traffic can starve build completion under load.

---

# Note on remaining Step 2 deliverable requirements
This file completes the per-service audit content required by Step 2, but “estimated max throughput” values are intentionally expressed as **structural concurrency bounds** (worker concurrency and sequential orchestration) rather than hard RPS numbers, because the repository does not provide benchmark data for per-call latency under load.

A quantitative RPS/throughput table can be generated in the next phase using measured LLM call latencies and event emission counts per build (also directly extractable from orchestrator logic). 

