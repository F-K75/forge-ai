"""Shared audit-logging helper.

Critical, user- and admin-initiated operations (project deletion, API key and
webhook CRUD, account deletion, permission/credit changes) must leave an
append-only, attributable trail for security forensics and compliance
(BE-009). This helper builds an ``AuditLog`` from the request context so every
call site captures the same fields — including the client IP and user-agent,
which earlier audit writes omitted (audit appendix P2-LOW-002).
"""
from typing import Any, Dict, Optional

from fastapi import Request

from core.models import AuditLog
from core.security import get_client_ip


async def record_audit_log(
    db,
    request: Optional[Request],
    actor,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    changes: Optional[Dict[str, Any]] = None,
) -> None:
    """Persist an append-only audit entry.

    ``actor`` is the acting user (has ``.id`` and ``.email``); for admin
    actions it is the admin, for user-facing actions it is the user themselves.
    IP address and user-agent are taken from ``request`` when present.
    """
    ip_address = None
    user_agent = None
    if request is not None:
        ip_address = await get_client_ip(request)
        user_agent = request.headers.get("user-agent")

    audit_log = AuditLog(
        actor_id=actor.id,
        actor_email=actor.email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        changes=changes or {},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.audit_logs.insert_one(audit_log.model_dump())
