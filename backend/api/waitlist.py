"""Public waitlist signup (``POST /v1/waitlist``).

Used by the static ``landing.html`` page, so it is unauthenticated and
CSRF-exempt. Abuse controls:

* per-IP limit (``waitlist`` zone in ``core.security.rate_limit_middleware``),
* per-email limit (``EMAIL_RATE_LIMITS["waitlist"]``; over the limit the
  write is skipped but the response is unchanged),
* a honeypot field (``website``) that real users never fill in,
* a unique index on ``waitlist.email`` (``core.database``).

The response is identical whether or not the email was already on the list,
so the endpoint cannot be used to check who has signed up.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from core.database import get_db
from core.models import utcnow
from core.security import check_email_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/waitlist", tags=["waitlist"])

OK_RESPONSE = {"ok": True}


class WaitlistSignup(BaseModel):
    email: EmailStr = Field(max_length=255)
    source: Optional[str] = Field(default=None, max_length=64)
    # Honeypot: hidden from humans on the landing page; bots tend to fill it.
    website: Optional[str] = Field(default=None, max_length=255)


@router.post("")
async def join_waitlist(req: WaitlistSignup):
    if req.website:
        # Pretend success so bots don't learn they were filtered.
        return OK_RESPONSE

    email = req.email.strip().lower()
    db = await get_db()

    allowed, _ = await check_email_rate_limit(email, "waitlist", db)
    if not allowed:
        # Same email submitted repeatedly (double-clicks, retries, or someone
        # hammering one address). Skip the write but answer normally: an error
        # here would only confuse a real user who is already on the list.
        return OK_RESPONSE

    now = utcnow()
    try:
        await db.waitlist.update_one(
            {"email": email},
            {
                "$setOnInsert": {
                    "id": f"wl_{uuid.uuid4().hex}",
                    "email": email,
                    "source": (req.source or "landing").strip()[:64],
                    "created_at": now,
                },
                "$set": {"last_seen_at": now},
            },
            upsert=True,
        )
    except DuplicateKeyError:
        # A concurrent signup for the same email won the upsert race.
        pass
    return OK_RESPONSE
