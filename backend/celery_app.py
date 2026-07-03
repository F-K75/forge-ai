from celery import Celery
from core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "forge",
    broker=settings.celery_broker_url or settings.redis_url,
    backend=settings.celery_result_backend or settings.redis_url,
)

celery_app.conf.task_routes = {
    "backend.tasks.build_tasks.run_build": {"queue": "build"},
    "backend.tasks.build_tasks.update_build_status": {"queue": "build"},
}

celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"

import tasks.build_tasks  # noqa: E402,F401 - registers tasks on this app instance