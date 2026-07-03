from fastapi import FastAPI, Request
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
from api.auth import router as auth_router
from api.billing import router as billing_router
from api.admin import router as admin_router
from api.analytics import router as analytics_router
from api.marketplace import router as marketplace_router
from api.growth import router as growth_router
from api.api_keys import router as api_keys_router
from api.webhooks import router as webhooks_router
from api.gdpr import router as gdpr_router
from api.deployments import router as deployments_router
from core.database import close_connections
from core.config import get_settings
from core.security import (
    rate_limit_middleware,
    request_size_limit_middleware,
    csrf_protection_middleware,
    request_id_middleware,
    RequestIdLogFilter,
)
from services.ws_manager import manager as ws_manager

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
    from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
    from prometheus_client import CollectorRegistry
    
    # Create a custom registry
    registry = CollectorRegistry()
    
    # Define metrics
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
    ws_manager.start()
    yield
    await ws_manager.stop()
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
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    if settings.sentry_dsn:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# Add trusted host middleware to prevent host header attacks
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[h.strip() for h in settings.allowed_hosts.split(",") if h.strip()],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
    max_age=600,
)

app.middleware("http")(request_size_limit_middleware)
app.middleware("http")(csrf_protection_middleware)
app.middleware("http")(rate_limit_middleware)

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

app.include_router(auth_router)
app.include_router(builds_router)
app.include_router(projects_router)
app.include_router(billing_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(marketplace_router)
app.include_router(growth_router)
app.include_router(api_keys_router)
app.include_router(webhooks_router)
app.include_router(gdpr_router)
app.include_router(deployments_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/detailed")
async def health_detailed():
    """Detailed health check including database, redis, and Celery worker connectivity."""
    from core.database import get_db, get_redis
    health_status = {"status": "ok", "checks": {}}

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
        # control.inspect().ping() is a blocking network round-trip to any
        # live workers -- run off the event loop so a slow/absent worker
        # doesn't stall this request (BE-011: previously neither /health nor
        # /health/detailed checked Celery at all).
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


@app.get("/integrations/playbooks")
async def list_playbooks():
    from agents.integration import IntegrationAgent
    return IntegrationAgent.get_available_playbooks()


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    if PROMETHEUS_ENABLED:
        from fastapi.responses import Response
        return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)
    return {"status": "metrics not enabled"}