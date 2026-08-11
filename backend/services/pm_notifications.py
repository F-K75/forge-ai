"""Notification trigger points for the Agile PM layer (Module 15).

Writes to the same `notifications` collection/shape as api/growth.py's
create_notification, so the existing GET /growth/notifications endpoint
surfaces these without any change on that side.
"""

import json
import logging

import httpx

from core.models import utcnow


logger = logging.getLogger(__name__)


async def notify(db, user_id: str, title: str, message: str, type: str = "info") -> None:
    if not user_id:
        return
    try:
        await db.notifications.insert_one({
            "id": f"notif_{utcnow().timestamp()}",
            "user_id": user_id,
            "title": title,
            "message": message,
            "type": type,
            "created_at": utcnow(),
        })
    except Exception:
        pass


async def notify_sprint_completed(db, user_id: str, sprint_name: str) -> None:
    await notify(db, user_id, "Sprint completed", f"{sprint_name} is complete.", type="success")


async def notify_task_blocked(db, user_id: str, task_title: str, reason: str = "") -> None:
    await notify(db, user_id, "Task blocked", f"{task_title} is blocked.{(' ' + reason) if reason else ''}", type="warning")


async def notify_agent_finished(db, user_id: str, task_title: str, agent: str) -> None:
    await notify(db, user_id, "Agent finished", f"{agent} finished work on {task_title}.", type="success")


async def notify_pr_approved(db, user_id: str, task_title: str) -> None:
    await notify(db, user_id, "PR approved", f"The pull request for {task_title} was approved.", type="success")


async def notify_pr_merged(db, user_id: str, task_title: str) -> None:
    await notify(db, user_id, "PR merged", f"The pull request for {task_title} was merged.", type="success")


async def notify_slack(title: str, message: str, webhook_url: str | None = None) -> None:
    """Post a short notification to Slack if a webhook URL is configured.

    Fail-open: if delivery fails or no URL is configured, the error is logged
    and swallowed so notification delivery never blocks the main workflow.
    """
    url = webhook_url or getattr(__import__("core.config", fromlist=["get_settings"]).get_settings(), "slack_webhook_url", "")
    if not url:
        return
    payload = {"text": f"*{title}*\n{message}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json=payload)
    except Exception:
        logger.debug("Slack notification failed", exc_info=True)
