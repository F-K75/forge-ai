import logging

from celery import Celery
from celery.signals import worker_shutting_down
from core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

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


@worker_shutting_down.connect
def _log_graceful_shutdown(sig, how, exitcode, **kwargs):
    """Celery's SIGTERM handler already does a warm shutdown (stop taking
    new tasks, finish in-flight ones) with no extra code required -- this
    just makes that actually visible in logs instead of a worker silently
    disappearing, and gives an explicit place to hang future cleanup
    (BE-005; the k8s/Compose terminationGracePeriodSeconds/stop_grace_period
    changes are what actually give this enough time to matter)."""
    logger.info("Celery worker shutting down gracefully: how=%s exitcode=%s", how, exitcode)