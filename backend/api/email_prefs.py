"""Email preference endpoints.

* ``GET  /v1/email/unsubscribe?token=...`` -- confirmation page. Does NOT
  change anything: email security scanners prefetch links, and a GET that
  unsubscribed would opt people out without them ever clicking.
* ``POST /v1/email/unsubscribe?token=...`` -- performs the unsubscribe. Used by
  the confirmation page's button and by mail clients' one-click unsubscribe
  (RFC 8058 sends ``List-Unsubscribe=One-Click`` as the form body).
* ``GET/PUT /v1/email/preferences`` -- the logged-in user's own setting, so
  they can opt back in.

The unsubscribe routes are public (the signed token is the credential) and
CSRF-exempt (mail clients POST with no session).
"""

from __future__ import annotations

from html import escape
from typing import Optional
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from api.auth import get_current_user
from core.database import get_db
from core.models import User, utcnow
from services.email_prefs import verify_unsubscribe_token

router = APIRouter(prefix="/email", tags=["email"])

_PAGE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{title} - Forge</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<main style="max-width:480px;margin:64px auto;background:#fff;border-radius:12px;padding:32px;">
<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;">Forge</p>
<h1 style="margin:0 0 12px;font-size:18px;color:#111827;">{title}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#374151;">{body}</p>
{form}
</main></body></html>"""

_INVALID = dict(
    title="This link isn't valid",
    body="The unsubscribe link is incomplete or has been changed. Try the link from a "
    "more recent email, or turn off product emails from your account settings.",
    form="",
)


def _page(status_code: int = 200, **parts: str) -> HTMLResponse:
    return HTMLResponse(_PAGE.format(**parts), status_code=status_code)


@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_page(token: str = Query("", max_length=512)):
    if not verify_unsubscribe_token(token):
        return _page(400, **_INVALID)
    form = (
        '<form method="post" action="">'
        f'<input type="hidden" name="token" value="{escape(token, quote=True)}">'
        '<button type="submit" style="padding:12px 20px;border:0;border-radius:8px;'
        'background:#111827;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">'
        "Unsubscribe</button></form>"
    )
    return _page(
        title="Unsubscribe from Forge product emails?",
        body="You'll stop getting tips and reminders. Account emails, like password "
        "resets and billing notices, will still be sent.",
        form=form,
    )


async def _token_from_request(request: Request, query_token: Optional[str]) -> str:
    if query_token:
        return query_token
    body = (await request.body())[:2048].decode("utf-8", "replace")
    return (parse_qs(body).get("token") or [""])[0]


@router.post("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe(request: Request, token: Optional[str] = Query(None, max_length=512)):
    user_id = verify_unsubscribe_token(await _token_from_request(request, token))
    if not user_id:
        return _page(400, **_INVALID)
    db = await get_db()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"marketing_emails_opt_out": True, "marketing_emails_updated_at": utcnow()}},
    )
    return _page(
        title="You're unsubscribed",
        body="You won't get Forge tips and reminders any more. You can turn them back "
        "on any time from your account settings.",
        form="",
    )


class EmailPreferences(BaseModel):
    marketing_emails: bool


@router.get("/preferences", response_model=EmailPreferences)
async def get_preferences(current_user: User = Depends(get_current_user)):
    db = await get_db()
    doc = await db.users.find_one({"id": current_user.id}, {"_id": 0, "marketing_emails_opt_out": 1})
    return EmailPreferences(marketing_emails=not (doc or {}).get("marketing_emails_opt_out", False))


@router.put("/preferences", response_model=EmailPreferences)
async def update_preferences(req: EmailPreferences, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": {"marketing_emails_opt_out": not req.marketing_emails, "marketing_emails_updated_at": utcnow()}},
    )
    return req
