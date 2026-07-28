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
celery_app.conf.beat_schedule = {
    "cleanup-old-dead-letters": {
        "task": "backend.tasks.build_tasks.cleanup_old_dead_letters",
        "schedule": 3600.0,
        "args": (30,),
    },
}

import tasks.build_tasks  # noqa: E402,F401 - registers tasks on this app instance
import tasks.pm_tasks  # noqa: E402,F401 - registers tasks on this app instance


@worker_shutting_down.connect
def _graceful_shutdown(sig, how, exitcode, **kwargs):
    logger.info("Celery worker shutting down gracefully: how=%s exitcode=%s", how, exitcode)
    try:
        celery_app.control.cancel_consumer(queue="build", reply=True)
    except Exception:
        logger.debug("cancel_consumer failed", exc_info=True)