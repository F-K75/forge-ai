"""Small helpers shared by the ``core.os`` modules."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Collection names (docs/os/ARCHITECTURE.md, "Persistence model").
SESSIONS = "os_sessions"
MESSAGES = "os_messages"
EVENTS = "os_events"
SURFACES = "os_surfaces"
WORKSPACES = "os_workspaces"
TURNS = "os_turns"
ATTACHMENTS = "os_attachments"
ATTACHMENT_CHUNKS = "os_attachment_chunks"

# Event replay window (PHASE2_DECISIONS.md #6) -- also the attachment lifetime (#3).
EVENT_RETENTION_SECONDS = 30 * 24 * 3600


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime] = None) -> str:
    """ISO-8601 UTC timestamp, ``Z`` suffix (fits the contract's ``Timestamp``)."""
    return (dt or utc_now()).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    """Opaque id matching the contract ``Id`` pattern (``^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$``)."""
    return f"{prefix}_{secrets.token_hex(10)}"


class OsHTTPError(Exception):
    """Service-layer error mapped to an HTTP status by ``api/os.py``.

    Services never import FastAPI; the router translates these.
    """

    def __init__(self, status: int, code: str, message: str, *, extra: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra or {}


def not_found(what: str = "Not found") -> OsHTTPError:
    # Unknown and foreign ids are indistinguishable (404, not 403), matching
    # api/kernel.py `_assert_project_access` (ARCHITECTURE.md, security model #6).
    return OsHTTPError(404, "not_found", what)


def strip_mongo(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if doc is None:
        return None
    out = dict(doc)
    out.pop("_id", None)
    return out
