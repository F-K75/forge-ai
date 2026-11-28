"""``os_*`` collection indexes (docs/os/ARCHITECTURE.md, "Persistence model").

Applied by migration v6 in ``core/migrations.py``. Idempotent: ``create_index``
is a no-op for an index that already exists with the same spec.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from core.os.common import (
    ATTACHMENT_CHUNKS,
    ATTACHMENTS,
    EVENT_RETENTION_SECONDS,
    EVENTS,
    MESSAGES,
    SESSIONS,
    SURFACES,
    TURNS,
    WORKSPACES,
)

# (collection, keys, options)
OS_INDEXES: List[Tuple[str, List[Tuple[str, int]], Dict[str, Any]]] = [
    (SESSIONS, [("id", 1)], {"unique": True, "name": "os_sessions_id"}),
    (SESSIONS, [("user_id", 1), ("updated_at", -1)], {"name": "os_sessions_user_updated"}),
    (SESSIONS, [("user_id", 1), ("pinned", 1)], {"name": "os_sessions_user_pinned"}),
    (MESSAGES, [("session_id", 1), ("created_at", 1)], {"name": "os_messages_session_created"}),
    (MESSAGES, [("id", 1)], {"unique": True, "name": "os_messages_id"}),
    (EVENTS, [("session_id", 1), ("seq", 1)], {"unique": True, "name": "os_events_session_seq"}),
    # 30-day replay window (PHASE2_DECISIONS.md #6); sessions then restore from snapshots.
    (EVENTS, [("created_at", 1)], {"expireAfterSeconds": EVENT_RETENTION_SECONDS, "name": "os_events_ttl"}),
    (SURFACES, [("surface_id", 1)], {"unique": True, "name": "os_surfaces_surface_id"}),
    (SURFACES, [("session_id", 1)], {"name": "os_surfaces_session"}),
    (WORKSPACES, [("user_id", 1), ("id", 1)], {"unique": True, "name": "os_workspaces_user_id"}),
    (
        WORKSPACES,
        [("user_id", 1)],
        {"unique": True, "partialFilterExpression": {"current": True}, "name": "os_workspaces_user_current"},
    ),
    (TURNS, [("session_id", 1), ("client_turn_id", 1)], {"unique": True, "name": "os_turns_session_client"}),
    (TURNS, [("id", 1)], {"unique": True, "name": "os_turns_id"}),
    (TURNS, [("user_id", 1), ("client_turn_id", 1)], {"name": "os_turns_user_client"}),
    (ATTACHMENTS, [("id", 1)], {"unique": True, "name": "os_attachments_id"}),
    (ATTACHMENTS, [("user_id", 1), ("created_at", -1)], {"name": "os_attachments_user_created"}),
    # Attachments are ephemeral (PHASE2_DECISIONS.md #3): same lifetime as event replay.
    (ATTACHMENTS, [("created_at", 1)], {"expireAfterSeconds": EVENT_RETENTION_SECONDS, "name": "os_attachments_ttl"}),
    (ATTACHMENT_CHUNKS, [("attachment_id", 1), ("n", 1)], {"unique": True, "name": "os_attachment_chunks_id_n"}),
    (
        ATTACHMENT_CHUNKS,
        [("created_at", 1)],
        {"expireAfterSeconds": EVENT_RETENTION_SECONDS, "name": "os_attachment_chunks_ttl"},
    ),
]


async def ensure_os_indexes(db) -> List[str]:
    names = []
    for collection, keys, options in OS_INDEXES:
        names.append(await db[collection].create_index(keys, **options))
    return names
