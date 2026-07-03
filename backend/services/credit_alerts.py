"""Credit usage alert emails (PROD-039).

Fires when a user's remaining credits drop to or below a threshold
fraction of their plan's monthly allocation, so they find out before a
build fails on "Insufficient credits" rather than only after. Previously
this didn't exist at all -- credits could silently run out with no
warning.

Alerts are deduplicated per threshold via `credit_alerts_sent` on the user
doc, cleared wherever credits are granted/increased (checkout completed,
admin credit adjustment, credit purchase) so a user who tops up gets
warned again next time they run low.
"""

import logging
from typing import Optional

from core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Fraction of the plan's total monthly credit allocation remaining.
# Ordered highest-to-lowest so a big drop (e.g. one expensive build taking
# a user straight from 100% to 0%) still records/sends every threshold it
# crossed, not just the lowest one.
CREDIT_ALERT_THRESHOLDS = [0.20, 0.0]

# Kept independent of api/billing.py's PLAN_DETAILS (imported directly at
# call time to avoid a hard import-order dependency at module load).


async def check_and_send_credit_alerts(
    db, user_id: str, plan: str, credits_remaining: int
) -> None:
    """Call right after a credit deduction with the user's up-to-date plan
    and remaining balance."""
    from api.billing import PLAN_DETAILS  # local import: avoids a load-time cycle

    plan_details = next((p for p in PLAN_DETAILS if p["tier"] == plan), None)
    total = plan_details["credits"] if plan_details else 0
    if total <= 0:
        return

    fraction_remaining = credits_remaining / total

    user_doc = await db.users.find_one(
        {"id": user_id}, {"_id": 0, "email": 1, "credit_alerts_sent": 1}
    )
    if not user_doc or not user_doc.get("email"):
        return

    already_sent = set(user_doc.get("credit_alerts_sent") or [])
    newly_triggered = [
        _threshold_key(t)
        for t in CREDIT_ALERT_THRESHOLDS
        if fraction_remaining <= t and _threshold_key(t) not in already_sent
    ]
    if not newly_triggered:
        return

    await db.users.update_one(
        {"id": user_id},
        {"$addToSet": {"credit_alerts_sent": {"$each": newly_triggered}}},
    )

    for key in newly_triggered:
        _send_credit_alert_email(user_doc["email"], key, credits_remaining, total)


async def reset_credit_alerts(db, user_id: str) -> None:
    """Clear alert dedup state -- call wherever a user's credits go up
    (checkout completed, admin credit grant, credit purchase) so they're
    warned again next time they run low, instead of only ever once."""
    await db.users.update_one({"id": user_id}, {"$set": {"credit_alerts_sent": []}})


def _threshold_key(threshold: float) -> str:
    return f"{int(threshold * 100)}pct"


def _send_credit_alert_email(
    email: str, threshold_key: str, credits_remaining: int, total: int
) -> None:
    if not settings.resend_api_key:
        return
    try:
        import resend

        resend.api_key = settings.resend_api_key
        if threshold_key == "0pct":
            subject = "You're out of Forge credits"
            message = (
                f"You've used all {total} credits in your current plan. "
                "Upgrade your plan or purchase additional credits to keep building."
            )
        else:
            subject = "Your Forge credits are running low"
            message = (
                f"You have {credits_remaining} of {total} credits remaining "
                f"({int((credits_remaining / total) * 100)}%). "
                "Consider upgrading your plan or purchasing more credits."
            )
        resend.Emails.send(
            {
                "from": settings.from_email,
                "to": email,
                "subject": subject,
                "html": f"<p>{message}</p><p><a href=\"{settings.app_url}/billing\">Manage billing</a></p>",
            }
        )
    except Exception:
        logger.exception("Failed to send credit alert email")
