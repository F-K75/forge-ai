"""Daily Celery beat task for the S0 adjudication retention rules (PV-6).

The TTL indexes delete expired adjudication excerpts (90 days) and access-log
rows (1 year) on their own; this sweep is their backstop and the only path
that anonymizes labels once their excerpt's retention has passed. Safe to run
more than once: every step is idempotent.
"""

import logging

from celery_app import celery_app as current_app
from core.adjudication import run_adjudication_retention
from core.database import get_db
from core.models import utcnow
from tasks.pm_tasks import _run_async  # one event loop per worker process (Motor is loop-bound)

logger = logging.getLogger(__name__)


@current_app.task(
    name="backend.tasks.adjudication_tasks.run_adjudication_retention",
    max_retries=0,
    ignore_result=True,
)
def run_adjudication_retention_task() -> dict:
    async def _run():
        db = await get_db()
        counts = await run_adjudication_retention(db, now=utcnow())
        logger.info("Adjudication retention sweep: %s", counts)
        return counts

    return _run_async(_run())
