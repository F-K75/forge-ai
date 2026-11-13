"""Sends the promotional onboarding emails (nudge, first build done, tips).

``run_onboarding_sweep`` is called hourly by the Celery beat task in
``tasks/onboarding_tasks.py``. Each rule finds users who qualify, then for each
user atomically claims ``onboarding_emails.<template>`` on their user document
*before* sending, so overlapping sweeps, retries or several workers can never
send the same email twice. A failed send is logged and not retried: missing
one onboarding email is better than risking duplicates.

Only users who signed up within ``onboarding_max_age_days`` are considered, so
turning this on doesn't email the whole existing user base at once. Every send
goes through ``build_promotional_email``, which skips users who unsubscribed
and adds the unsubscribe link and List-Unsubscribe headers.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Awaitable, Callable, Dict, Optional

from core.config import get_settings
from services.email_prefs import build_promotional_email

logger = logging.getLogger(__name__)

NUDGE_AFTER = timedelta(days=2)
TIPS_AFTER = timedelta(days=5)
BUILD_DONE_WINDOW = timedelta(days=2)

SendFn = Callable[[dict], Awaitable[None]]


async def _claim(db, user_id: str, template: str, now: datetime) -> Optional[dict]:
    """Atomically mark ``template`` as sent for this user. Returns the user doc
    if this caller won the claim, None if it was already claimed."""
    field = f"onboarding_emails.{template}"
    return await db.users.find_one_and_update(
        {"id": user_id, field: {"$exists": False}},
        {"$set": {field: now}},
        return_document=True,
    )


async def _send_one(db, user_id: str, template: str, now: datetime, send: SendFn, **kwargs) -> bool:
    user_doc = await _claim(db, user_id, template, now)
    if not user_doc:
        return False
    params = build_promotional_email(user_doc, template, **kwargs)
    if params is None:
        return False  # unsubscribed; the claim stops us re-checking every hour
    try:
        await send(params)
        return True
    except Exception:
        logger.exception("Onboarding email %s failed for user %s", template, user_id)
        return False


def _recent_verified_users(signed_up_before: datetime, signed_up_after: datetime, template: str) -> dict:
    return {
        "email_verified": True,
        "created_at": {"$lte": signed_up_before, "$gte": signed_up_after},
        f"onboarding_emails.{template}": {"$exists": False},
        "marketing_emails_opt_out": {"$ne": True},
    }


async def run_onboarding_sweep(db, now: datetime, send: SendFn) -> Dict[str, int]:
    settings = get_settings()
    oldest = now - timedelta(days=settings.onboarding_max_age_days)
    limit = settings.onboarding_batch_size
    sent = {"first_build_nudge": 0, "first_build_done": 0, "planning_tips": 0}

    # 1. First-build nudge: verified, signed up 2+ days ago, no build at all.
    query = _recent_verified_users(now - NUDGE_AFTER, oldest, "first_build_nudge")
    for user in await db.users.find(query, {"_id": 0, "id": 1}).to_list(limit):
        if await db.builds.count_documents({"user_id": user["id"]}, limit=1):
            continue
        if await _send_one(db, user["id"], "first_build_nudge", now, send):
            sent["first_build_nudge"] += 1

    # 2. First build done: a successful build finished in the last 2 days,
    #    for a user who signed up recently. Only the first one triggers it,
    #    because the claim is per user.
    builds = await db.builds.find(
        {"status": "success", "completed_at": {"$gte": now - BUILD_DONE_WINDOW}},
        {"_id": 0, "user_id": 1, "project_id": 1},
    ).to_list(limit)
    seen = set()
    for build in builds:
        user_id = build["user_id"]
        if user_id in seen:
            continue
        seen.add(user_id)
        user = await db.users.find_one(
            {"id": user_id, "created_at": {"$gte": oldest}, "onboarding_emails.first_build_done": {"$exists": False}},
            {"_id": 0, "id": 1},
        )
        if not user:
            continue
        # Only their *first* success: skip users who already had one earlier.
        if await db.builds.count_documents(
            {"user_id": user_id, "status": "success", "completed_at": {"$lt": now - BUILD_DONE_WINDOW}},
            limit=1,
        ):
            continue
        project = await db.projects.find_one({"id": build["project_id"]}, {"_id": 0, "name": 1}) or {}
        if await _send_one(
            db, user_id, "first_build_done", now, send,
            project_name=project.get("name"), project_id=build["project_id"],
        ):
            sent["first_build_done"] += 1

    # 3. Planning tips: verified, signed up 5+ days ago.
    query = _recent_verified_users(now - TIPS_AFTER, oldest, "planning_tips")
    for user in await db.users.find(query, {"_id": 0, "id": 1}).to_list(limit):
        if await _send_one(db, user["id"], "planning_tips", now, send):
            sent["planning_tips"] += 1

    return sent


def resend_sender() -> SendFn:
    """Send via Resend from the configured address (sync SDK, run in a thread)."""
    import resend

    settings = get_settings()
    resend.api_key = settings.resend_api_key

    async def _send(params: dict) -> None:
        await asyncio.to_thread(resend.Emails.send, {"from": settings.from_email, **params})

    return _send
