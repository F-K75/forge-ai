from fastapi import Depends, FastAPI, HTTPException, Request
import os
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging
import time

logger = logging.getLogger(__name__)

from api.builds import router as builds_router
from api.projects import router as projects_router
from api.auth import get_current_user, router as auth_router
from api.billing import router as billing_router
from api.razorpay import router as razorpay_router
from api.admin import router as admin_router
from api.analytics import router as analytics_router
from api.marketplace import router as marketplace_router
from api.growth import router as growth_router
from api.api_keys import router as api_keys_router
from api.webhooks import router as webhooks_router
from api.gdpr import router as gdpr_router
from api.deployments import router as deployments_router
from api.support import router as support_router
from api.initiatives import router as initiatives_router
from api.epics import router as epics_router
from api.stories import router as stories_router
from api.tasks import router as pm_tasks_router
from api.sprints import router as sprints_router
from api.releases import router as releases_router
from api.agent_executions import router as agent_executions_router
from api.llm import router as llm_router
from api.optimizer import router as optimizer_router
from api.org_llm_policy import router as org_llm_policy_router
from api.budget import router as budget_router
from api.retrieval import router as retrieval_router
from api.engineering import router as engineering_router
from engineering_plugins import register_engineering_plugins
from api.v1 import v1_router
from core.database import close_connections
from core.config import get_settings
from core.security import (
    rate_limit_middleware,
    request_size_limit_middleware,
    csrf_protection_middleware,
    request_id_middleware,
    RequestIdLogFilter,
)
from core.shutdown import get_health_status, init_shutdown_manager, DrainMiddleware, get_shutdown_manager
from services.ws_manager import manager as ws_manager
from services.pm_ws_manager import pm_manager

settings = get_settings()

# Correlation ID (BE-008): every log line now carries the request that
# produced it, via RequestIdLogFilter reading request_id_middleware's
# contextvar. Falls back to "-" for log lines emitted outside a request
# (startup, Celery tasks, etc.) rather than a KeyError from the missing field.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s",
)
# Attached to the handler, not the root logger itself -- a filter on the
# logger object only fires for records logged directly through it, while
# every module's `logging.getLogger(__name__)` pattern reaches the root
# logger's *handlers* via propagation, bypassing the logger-level filter.
for _handler in logging.getLogger().handlers:
    _handler.addFilter(RequestIdLogFilter())

# Prometheus metrics
try:
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    from core.metrics import registry

    from prometheus_client import Counter, Histogram

    http_requests_total = Counter(
        'http_requests_total',
        'Total HTTP requests',
        ['method', 'endpoint', 'status'],
        registry=registry
    )

    http_request_duration_seconds = Histogram(
        'http_request_duration_seconds',
        'HTTP request latency',
        ['method', 'endpoint'],
        registry=registry
    )

    PROMETHEUS_ENABLED = True
except ImportError:
    PROMETHEUS_ENABLED = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize shutdown manager and register signal handlers
    shutdown_manager = init_shutdown_manager()
    shutdown_manager.register_signal_handlers()

    ws_manager.start()
    pm_manager.start()

    # Fail fast if Mongo isn't reachable / isn't provisioned correctly.
    try:
        from core.database import get_db
        db = await get_db()
        await db.command("ping")
    except Exception:
        logger.exception("MongoDB startup health check failed")
        raise

    # Best-effort pre-warm of the DB-backed per-agent LLM overrides so the
    # first request after a deploy doesn't run with a cold (empty) cache.
    # Unlike the Mongo ping above, this must never block startup -- if it
    # fails (e.g. Mongo flaky right at boot), LLMRouter.generate() simply
    # falls back to YAML/env config until a later refresh (reload endpoint,
    # or another set_agent_override call) succeeds.
    try:
        from core.llm.router import get_llm_router
        await get_llm_router().config_loader.refresh_db_overrides()
        await get_llm_router().config_loader.refresh_org_policy_overrides()
        await get_llm_router().budget_manager.refresh_limits()
    except Exception:
        logger.warning("LLM agent override pre-warm failed; continuing with YAML/env config", exc_info=True)

    # Register engineering plugins (few-shot injection, context budget tagging,
    # version tracking, metrics annotation) into the prompt_builder pipeline.
    # These run automatically on every prompt_builder.build() call.
    register_engineering_plugins()

    # Best-effort, non-fatal schema/data migrations (DB-002). Each migration is
    # versioned and recorded in __forge_migrations; a failure is logged and
    # skipped so it never blocks startup.
    try:
        from core.migrations import run_migrations

        applied = await run_migrations(db)
        if applied:
            logger.info("Ran %d database migration(s)", len(applied))
    except Exception:
        logger.warning("Database migrations did not run; continuing", exc_info=True)

    yield

    # Graceful shutdown: wait for in-flight requests to complete (BE-005)
    logger.info("Shutdown initiated; waiting for in-flight requests to drain...")
    await get_shutdown_manager().wait_for_drain()

    await ws_manager.stop()
    await pm_manager.stop()
    await close_connections()


app = FastAPI(
    title="Forge API",
    description="AI-powered full-stack app builder",
    version="1.0.0",
    lifespan=lifespan,
)

if settings.sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=0.1,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch anything that escapes a route handler (a real bug, not an
    intentional HTTPException -- FastAPI's built-in handler for those takes
    precedence via its more specific type match, so this only fires for the
    unexpected) with a consistent JSON body instead of Starlette's default
    plain-text 500, and make sure it's actually logged and reported
    somewhere centralized rather than only ever reaching a server's stdout
    (BE-002).
    """
    if isinstance(exc, HTTPException):
        raise exc
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    if settings.sentry_dsn:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    resp = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    origin = request.headers.get("origin")
    if origin:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Credentials"] = "true"
    return resp


# Add trusted host middleware to prevent host header attacks
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[h.strip() for h in settings.allowed_hosts.split(",") if h.strip()],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins + [o.strip() for o in os.environ.get("FRONTEND_TUNNEL_URL", "").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
    max_age=600,
)

app.middleware("http")(request_size_limit_middleware)
app.middleware("http")(csrf_protection_middleware)
app.middleware("http")(rate_limit_middleware)

# Timeout middleware: fail fast on long-running requests so a single slow
# AI/model call or build cannot hold a worker indefinitely.
@app.middleware("http")
async def timeout_middleware(request: Request, call_next):
    try:
        response = await asyncio.wait_for(call_next(request), timeout=settings.request_timeout)
        return response
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=503,
            content={"detail": "Request timed out. Please try again later."},
        )

# Drain middleware must be after rate limiting so it can see the
# connection state but before request-ID middleware wraps the call.
app.add_middleware(DrainMiddleware)

# Prometheus metrics middleware
if PROMETHEUS_ENABLED:
    @app.middleware("http")
    async def prometheus_middleware(request, call_next):
        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time
        
        # Record metrics
        http_requests_total.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()
        
        http_request_duration_seconds.labels(
            method=request.method,
            endpoint=request.url.path
        ).observe(duration)

        return response

# Registered last so it's the outermost layer -- the request ID needs to be
# set before every other middleware and the route handler run, so all of
# their log lines get tagged with it too (BE-008).
app.middleware("http")(request_id_middleware)

# BE-004: legacy root-level API routes are still registered below, but this
# middleware adds Deprecation + Link headers so clients can migrate to /v1/.
@app.middleware("http")
async def deprecation_middleware(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/v1/") or path in ("/health", "/health/detailed", "/health/mongo-ping", "/health/pools", "/metrics"):
        return response
    if path.startswith("/api/llm"):
        return response
    if path.startswith("/razorpay"):
        return response
    if path.startswith("/billing/webhook"):
        return response
    if path.startswith("/auth/csrf-token"):
        return response
    successor = f"/v1{path}"
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = f'<{successor}>; rel="successor-version"'
    return response

# Canonical /v1/ routes (BE-004).
app.include_router(v1_router)

# Legacy root-level routes remain available during the deprecation window but
# receive Deprecation and Link headers pointing at their /v1/ successors.
app.include_router(auth_router)
app.include_router(builds_router)
app.include_router(projects_router)
app.include_router(billing_router)
app.include_router(razorpay_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(marketplace_router)
app.include_router(growth_router)
app.include_router(api_keys_router)
app.include_router(webhooks_router)
app.include_router(gdpr_router)
app.include_router(deployments_router)
app.include_router(support_router)
app.include_router(initiatives_router)
app.include_router(epics_router)
app.include_router(stories_router)
app.include_router(pm_tasks_router)
app.include_router(sprints_router)
app.include_router(releases_router)
app.include_router(agent_executions_router)
app.include_router(llm_router)
app.include_router(optimizer_router)
app.include_router(org_llm_policy_router)
app.include_router(budget_router)
app.include_router(retrieval_router)
app.include_router(engineering_router)


@app.get("/health")
async def health():
    try:
        status = get_health_status(get_shutdown_manager())
    except RuntimeError:
        status = {"status": "ok"}
    if status.get("status") == "draining":
        return JSONResponse(status_code=503, content=status)
    return status


@app.get("/health/mongo-ping")
async def health_mongo_ping():
    """MongoDB ping health check."""
    from core.database import get_db
    try:
        db = await get_db()
        await db.command("ping")
        return {"status": "ok"}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


async def _run_health_detailed() -> dict:
    """Core health-detailed logic. Always returns a dict so tests that call it
    directly (bypassing FastAPI) can assert on the body without dealing with
    response objects.

    The route handler wraps this and returns 503 when the result is degraded.
    """
    from core.database import get_db, get_redis

    health_status: dict = {"status": "ok", "checks": {}}

    try:
        db = await get_db()
        await db.command("ping")
        health_status["checks"]["database"] = "ok"
    except Exception as e:
        health_status["checks"]["database"] = f"error: {str(e)}"
        health_status["status"] = "degraded"

    try:
        redis = await get_redis()
        await redis.ping()
        health_status["checks"]["redis"] = "ok"
    except Exception as e:
        health_status["checks"]["redis"] = f"error: {str(e)}"
        health_status["status"] = "degraded"

    try:
        from celery_app import celery_app
        pong = await asyncio.to_thread(
            lambda: celery_app.control.inspect(timeout=1.0).ping()
        )
        if pong:
            health_status["checks"]["celery"] = f"ok ({len(pong)} worker(s))"
        else:
            health_status["checks"]["celery"] = "error: no workers responded"
            health_status["status"] = "degraded"
    except Exception as e:
        health_status["checks"]["celery"] = f"error: {str(e)}"
        health_status["status"] = "degraded"

    return health_status


@app.get("/health/detailed")
async def health_detailed():
    """Detailed health check including database, redis, and Celery worker connectivity.

    Returns 200 when all dependencies are healthy and 503 when any check fails,
    so Kubernetes readinessProbes (which target this endpoint) correctly drain
    pods whose dependencies are down instead of continuing to route traffic to
    them.
    """
    result = await _run_health_detailed()
    if result.get("status") == "degraded":
        return JSONResponse(status_code=503, content=result)
    return result


@app.get("/health/pools")
async def health_pools():
    """Connection-pool monitoring (INF-008).

    Connection caps are already configured (Mongo maxPoolSize/minPoolSize +
    timeouts, Redis max_connections + socket timeouts in core/database.py), but
    nothing surfaced live pool utilization. Operators need to see saturation
    before it turns into waitQueue timeouts. Uses stable public APIs:
    MongoDB ``serverStatus.connections`` and Redis ``INFO clients``.
    """
    from core.database import get_db, get_redis

    result: dict = {"mongo": {}, "redis": {}}

    try:
        db = await get_db()
        status = await db.command("serverStatus")
        conn = status.get("connections", {})
        max_pool = min_pool = None
        try:
            client = db.client
            max_pool = client.options.max_pool_size
            min_pool = client.options.min_pool_size
        except Exception:
            pass
        result["mongo"] = {
            "current": conn.get("current"),
            "available": conn.get("available"),
            "total_created": conn.get("totalCreated"),
            "max_pool_size": max_pool,
            "min_pool_size": min_pool,
        }
    except Exception as e:
        result["mongo"] = {"error": str(e)}

    try:
        redis = await get_redis()
        info = await redis.info("clients")
        pool = redis.connection_pool
        result["redis"] = {
            "connected_clients": info.get("connected_clients"),
            "blocked_clients": info.get("blocked_clients"),
            "max_connections": getattr(pool, "max_connections", None),
        }
    except Exception as e:
        result["redis"] = {"error": str(e)}

    return result


@app.get("/integrations/playbooks")
async def list_playbooks(user: dict = Depends(get_current_user)):
    from agents.integration import IntegrationAgent
    return IntegrationAgent.get_available_playbooks()


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    if PROMETHEUS_ENABLED:
        from fastapi.responses import Response
        from core.metrics import update_optimizer_gauges, update_build_queue_gauges
        update_optimizer_gauges()
        await update_build_queue_gauges()
        return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)


# ---- Engineering modules Prometheus metrics ----
if PROMETHEUS_ENABLED:
    from prometheus_client import Counter, Histogram

    # Prompt engineering
    prompt_version_changes_total = Counter(
        "prompt_version_changes_total",
        "Prompt template version changes recorded",
        ["role", "change_type", "author"],
        registry=registry,
    )
    prompt_optimizations_total = Counter(
        "prompt_optimizations_total",
        "Prompt optimization runs",
        ["role", "success"],
        registry=registry,
    )
    prompt_optimization_duration_seconds = Histogram(
        "prompt_optimization_duration_seconds",
        "Prompt optimization duration",
        ["role"],
        registry=registry,
    )

    # Context engineering
    context_retrieval_chunks = Histogram(
        "context_retrieval_chunks",
        "Number of context chunks retrieved per request",
        ["role"],
        buckets=[0, 1, 2, 5, 10, 20, 50],
        registry=registry,
    )
    context_assembly_duration_seconds = Histogram(
        "context_assembly_duration_seconds",
        "Context assembly duration",
        ["role"],
        registry=registry,
    )

    # Harness engineering
    harness_evaluations_total = Counter(
        "harness_evaluations_total",
        "Harness evaluation runs",
        ["role", "result"],
        registry=registry,
    )
    harness_score = Histogram(
        "harness_score",
        "Harness evaluation scores distribution",
        ["role"],
        buckets=[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        registry=registry,
    )
    harness_ab_tests_total = Counter(
        "harness_ab_tests_total",
        "A/B test runs",
        ["role", "winner"],
        registry=registry,
    )

    # Loop engineering
    loop_iteration_count = Histogram(
        "loop_iteration_count",
        "Number of iterations in improvement loops",
        ["role"],
        buckets=[0, 1, 2, 3, 5, 10],
        registry=registry,
    )
    loop_quality_delta = Histogram(
        "loop_quality_delta",
        "Quality improvement delta in improvement loops",
        ["role"],
        buckets=[-0.5, -0.2, -0.1, 0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5],
        registry=registry,
    )
    loop_convergence_total = Counter(
        "loop_convergence_total",
        "Loop convergence outcomes",
        ["role", "converged"],
        registry=registry,
    )
