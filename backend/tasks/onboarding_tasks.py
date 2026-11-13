"""Hourly Celery beat task that sends promotional onboarding emails.

Does nothing unless ONBOARDING_EMAILS_ENABLED is true and RESEND_API_KEY is
set. The rules and the once-per-user guarantee live in
services/onboarding_emails.py.
"""

import logging

from celery_app import celery_app as current_app
from core.config import get_settings
from core.database import get_db
from core.models import utcnow
from services.onboarding_emails import resend_sender, run_onboarding_sweep
from tasks.pm_tasks import _run_async  # one event loop per worker process (Motor is loop-bound)

logger = logging.getLogger(__name__)


@current_app.task(
    name="backend.tasks.onboarding_tasks.send_onboarding_emails",
    # No retries: a retried sweep is harmless (claims are atomic) but pointless;
    # the next hourly run picks up anything this one missed.
    max_retries=0,
    ignore_result=True,
)
def send_onboarding_emails() -> dict:
    settings = get_settings()
    if not settings.onboarding_emails_enabled:
        return {"skipped": "disabled"}
    if not settings.resend_api_key:
        logger.warning("Onboarding emails enabled but RESEND_API_KEY is not set; skipping")
        return {"skipped": "no resend api key"}

    async def _run():
        db = await get_db()
        sent = await run_onboarding_sweep(db, utcnow(), resend_sender())
        logger.info("Onboarding email sweep sent %s", sent)
        return sent

    return _run_async(_run())
