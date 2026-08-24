import logging

from celery import Celery
from celery.signals import worker_process_init, worker_shutting_down, task_prerun, task_postrun
from core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


@worker_process_init.connect
def _reset_db_clients(sender=None, **kwargs):
    """Reset database clients in each worker process.

    Celery ForkPoolWorker inherits the parent process's module globals,
    including Motor/Redis clients bound to the parent's event loop. Recreate
    them here so every worker has loop-local connections and avoids
    "Future attached to a different loop" errors.
    """
    try:
        from core.database import reset_db_clients  # noqa: F401
        reset_db_clients()
    except Exception:
        logger.debug("reset_db_clients failed", exc_info=True)


celery_app = Celery(
    "forge",
    broker=settings.celery_broker_url or settings.redis_url,
    backend=settings.celery_result_backend or settings.redis_url,
)

celery_app.conf.task_routes = {
    "backend.tasks.build_tasks.run_build": {"queue": "build"},
    "backend.tasks.build_tasks.update_build_status": {"queue": "build"},
    "backend.tasks.pm_tasks.generate_initiative_plan": {"queue": "build"},
    "backend.tasks.pm_tasks.execute_task": {"queue": "build"},
    "backend.tasks.pm_tasks.run_decision_engine": {"queue": "build"},
}

celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"

import tasks.build_tasks  # noqa: E402,F401 - registers tasks on this app instance
import tasks.pm_tasks  # noqa: E402,F401 - registers tasks on this app instance


@task_prerun.connect
def _set_correlation_id(sender=None, headers=None, **kwargs):
    """Propagate the X-Request-ID from the task header into a context
    variable so that every log line inside the task carries the
    correlation ID of the originating HTTP request."""
    correlation_id = (headers or {}).get("correlation_id", "-")
    from core.security import request_id_var  # noqa: F401 - sets the context var
    request_id_var.set(correlation_id)


@task_postrun.connect
def _clear_correlation_id(sender=None, **kwargs):
    """Reset the correlation ID context variable after a task finishes."""
    from core.security import request_id_var  # noqa: F401 - resets the context var
    request_id_var.set("-")


@task_postrun.connect
def _publish_optimizer_fleet_snapshot(sender=None, **kwargs):
    """Publish this worker process's optimizer/cache snapshot to Redis so the
    API's /metrics scrape can aggregate fleet-wide optimizer ratios (8.5).

    Fire-and-forget: telemetry must never delay or break task processing, so
    any failure is swallowed inside publish_worker_snapshot_sync()."""
    from core.fleet_metrics import publish_worker_snapshot_sync

    publish_worker_snapshot_sync()


@worker_shutting_down.connect
def _graceful_shutdown(sig, how, exitcode, **kwargs):
    logger.info("Celery worker shutting down gracefully: how=%s exitcode=%s", how, exitcode)
    try:
        celery_app.control.cancel_consumer(queue="build", reply=True)
    except Exception:
        logger.debug("cancel_consumer failed", exc_info=True)