"""Marketing-email preferences and signed unsubscribe links.

Onboarding nudges and tips are promotional, so every one must carry a working
unsubscribe link (CAN-SPAM) and the ``List-Unsubscribe`` headers that Gmail and
Yahoo require for one-click unsubscribe from the mail client (RFC 8058).

Unsubscribe links work without logging in. The token is ``<user_id>.<sig>``,
where ``sig`` is an HMAC-SHA256 of the user id keyed with the JWT secret plus a
purpose string, so a token can't be forged or edited to unsubscribe someone
else, and isn't interchangeable with any other HMAC the app produces. Tokens
don't expire: an unsubscribe link has to keep working for as long as the email
sits in someone's inbox.

Transactional mail (verification, password reset, the welcome email, credit
alerts) is not affected by this preference.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Optional
from urllib.parse import quote

from core.config import get_settings

_PURPOSE = b"forge-email-unsubscribe-v1:"


def _sign(user_id: str) -> str:
    key = get_settings().jwt_secret.encode()
    digest = hmac.new(key, _PURPOSE + user_id.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def make_unsubscribe_token(user_id: str) -> str:
    return f"{user_id}.{_sign(user_id)}"


def verify_unsubscribe_token(token: str) -> Optional[str]:
    """Return the user id the token was issued for, or None if it's invalid."""
    if not token or "." not in token or len(token) > 512:
        return None
    user_id, _, sig = token.rpartition(".")
    if not user_id or not hmac.compare_digest(sig, _sign(user_id)):
        return None
    return user_id


def unsubscribe_url(user_id: str) -> str:
    base = get_settings().api_url.rstrip("/")
    return f"{base}/v1/email/unsubscribe?token={quote(make_unsubscribe_token(user_id))}"


def list_unsubscribe_headers(user_id: str) -> dict:
    """Headers for ``resend.Emails.send(..., "headers": ...)`` (RFC 2369 + RFC 8058)."""
    return {
        "List-Unsubscribe": f"<{unsubscribe_url(user_id)}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }


def wants_marketing_email(user_doc: Optional[dict]) -> bool:
    """True unless the user has opted out. Check before every promotional send."""
    return bool(user_doc) and not user_doc.get("marketing_emails_opt_out", False)


PROMOTIONAL_TEMPLATES = ("first_build_nudge", "first_build_done", "planning_tips")


def build_promotional_email(user_doc: Optional[dict], template: str, **template_kwargs) -> Optional[dict]:
    """Resend params for a promotional onboarding email, or None if the user opted out.

    The only supported way to build a promotional send: it checks the opt-out,
    adds the visible unsubscribe link and the List-Unsubscribe headers. Pass the
    result to ``resend.Emails.send`` after adding ``from``.
    """
    from services.email_templates import ONBOARDING_TEMPLATES

    if template not in PROMOTIONAL_TEMPLATES:
        raise ValueError(f"{template!r} is not a promotional template")
    if not wants_marketing_email(user_doc):
        return None
    user_id = user_doc["id"]
    content = ONBOARDING_TEMPLATES[template](
        name=user_doc.get("name"), unsubscribe_url=unsubscribe_url(user_id), **template_kwargs
    )
    return {
        "to": [user_doc["email"]],
        **content.as_resend_params(),
        "headers": list_unsubscribe_headers(user_id),
    }
