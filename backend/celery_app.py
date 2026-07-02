from celery import Celery
from core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "forge",
    broker=settings.celery_broker_url or settings.redis_url,
    backend=settings.celery_result_backend or settings.redis_url,
)

celery_app.conf.task_routes = {
    "backend.tasks.deployment": {"queue": "deployment"},
    "backend.tasks.build": {"queue": "build"},
}

celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.autodiscover_tasks(["backend"])