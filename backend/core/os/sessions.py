"""Repositories for ``os_sessions``, ``os_messages``, ``os_turns``, ``os_surfaces``
and ``os_workspaces``.

Every read and write is filtered on ``user_id`` (sessions are private to their
owner, PHASE2_DECISIONS.md #6; ``org_id`` / ``project_id`` are recorded for
later sharing). A foreign id behaves exactly like a missing one.
"""

from __future__ import annotations

import copy
import json
import logging
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from core.os.common import (
    MESSAGES,
    SESSIONS,
    SURFACES,
    TURNS,
    WORKSPACES,
    OsHTTPError,
    iso,
    new_id,
    not_found,
    strip_mongo,
    utc_now,
)
from core.os_contracts import FORGE_CATALOG_ID

logger = logging.getLogger(__name__)

TITLE_MAX = 200
# A running turn holds the session lease. A lease older than this is treated
# as abandoned (worker crash) so the session is never stuck behind a 409.
TURN_LEASE_SECONDS = 15 * 60
# Snapshot bound: a stored surface's data model may not exceed this (bytes of JSON).
MAX_DATA_MODEL_BYTES = 2 * 1024 * 1024
MAX_SURFACE_COMPONENTS = 200


def derive_title(prompt: str) -> str:
    """Session title from the first prompt: first line, whitespace-collapsed, <= 60 chars."""
    first = " ".join((prompt or "").strip().split())
    if not first:
        return "New session"
    return first if len(first) <= 60 else first[:57].rstrip() + "..."


def session_summary(doc: Dict[str, Any]) -> Dict[str, Any]:
    """``SessionSummary`` wire shape (closed; no internal fields)."""
    return {
        "id": doc["id"],
        "title": (doc.get("title") or "New session")[:TITLE_MAX],
        "project_id": doc.get("project_id"),
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
        "turn_count": int(doc.get("turn_count") or 0),
        "pinned": bool(doc.get("pinned")),
        "archived": bool(doc.get("archived")),
    }


class SessionRepository:
    def __init__(self, db):
        self.col = db[SESSIONS]

    async def create(
        self, *, user_id: str, title: str, project_id: Optional[str] = None, org_id: Optional[str] = None
    ) -> Dict[str, Any]:
        now = iso()
        doc = {
            "id": new_id("ses"),
            "user_id": user_id,
            "org_id": org_id,
            "project_id": project_id,
            "title": (title or "New session")[:TITLE_MAX],
            "created_at": now,
            "updated_at": now,
            "turn_count": 0,
            "pinned": False,
            "archived": False,
            "deleted_at": None,
            "seq_counter": 0,
            "active_turn_id": None,
            "active_turn_at": None,
        }
        await self.col.insert_one(dict(doc))
        return doc

    async def get(self, user_id: str, session_id: str) -> Optional[Dict[str, Any]]:
        return strip_mongo(
            await self.col.find_one({"id": session_id, "user_id": user_id, "deleted_at": None}, {"_id": 0})
        )

    async def require(self, user_id: str, session_id: str) -> Dict[str, Any]:
        doc = await self.get(user_id, session_id)
        if doc is None:
            raise not_found("Session not found")
        return doc

    async def list(
        self,
        user_id: str,
        *,
        page: int = 1,
        per_page: int = 30,
        include_archived: bool = False,
        pinned: Optional[bool] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        query: Dict[str, Any] = {"user_id": user_id, "deleted_at": None}
        if not include_archived:
            query["archived"] = False
        if pinned is not None:
            query["pinned"] = pinned
        page = max(1, page)
        per_page = max(1, min(per_page, 100))
        total = await self.col.count_documents(query)
        cursor = (
            self.col.find(query, {"_id": 0})
            .sort([("pinned", -1), ("updated_at", -1)])
            .skip((page - 1) * per_page)
            .limit(per_page)
        )
        docs = await cursor.to_list(length=per_page)
        return docs, total

    async def update(self, user_id: str, session_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        allowed = {k: v for k, v in patch.items() if k in ("title", "pinned", "archived") and v is not None}
        if "title" in allowed:
            allowed["title"] = str(allowed["title"]).strip()[:TITLE_MAX] or "New session"
        allowed["updated_at"] = iso()
        doc = await self.col.find_one_and_update(
            {"id": session_id, "user_id": user_id, "deleted_at": None},
            {"$set": allowed},
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            raise not_found("Session not found")
        return strip_mongo(doc)

    async def soft_delete(self, user_id: str, session_id: str) -> None:
        doc = await self.col.find_one_and_update(
            {"id": session_id, "user_id": user_id, "deleted_at": None},
            {"$set": {"deleted_at": iso(), "updated_at": iso()}},
            projection={"_id": 0},
        )
        if doc is None:
            raise not_found("Session not found")

    async def touch(self, user_id: str, session_id: str, *, new_turn: bool = False) -> None:
        update: Dict[str, Any] = {"$set": {"updated_at": iso()}}
        if new_turn:
            update["$inc"] = {"turn_count": 1}
        await self.col.update_one({"id": session_id, "user_id": user_id}, update)

    # -- turn lease (one running turn per session, atomic) ------------------ #

    async def acquire_turn_lease(self, user_id: str, session_id: str, turn_id: str) -> bool:
        now = utc_now()
        stale_before = iso(now - timedelta(seconds=TURN_LEASE_SECONDS))
        base = {"id": session_id, "user_id": user_id, "deleted_at": None}
        update = {"$set": {"active_turn_id": turn_id, "active_turn_at": iso(now)}}
        doc = await self.col.find_one_and_update({**base, "active_turn_id": None}, update, projection={"_id": 0})
        if doc is not None:
            return True
        doc = await self.col.find_one_and_update(
            {**base, "active_turn_at": {"$lt": stale_before}}, update, projection={"_id": 0}
        )
        return doc is not None

    async def release_turn_lease(self, session_id: str, turn_id: str) -> None:
        await self.col.update_one(
            {"id": session_id, "active_turn_id": turn_id},
            {"$set": {"active_turn_id": None, "active_turn_at": None}},
        )


class MessageRepository:
    def __init__(self, db):
        self.col = db[MESSAGES]

    async def add(
        self,
        *,
        user_id: str,
        session_id: str,
        turn_id: str,
        role: str,
        text: Optional[str],
        fmt: str = "plain",
        attachments: Optional[List[Dict[str, Any]]] = None,
        surface_ids: Optional[List[str]] = None,
        intent: Optional[str] = None,
        message_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        doc = {
            "id": message_id or new_id("msg"),
            "session_id": session_id,
            "user_id": user_id,
            "turn_id": turn_id,
            "role": role,
            "created_at": iso(),
            "text": text[:100000] if isinstance(text, str) else None,
            "format": fmt,
            "attachments": list(attachments or [])[:10],
            "surface_ids": list(surface_ids or [])[:20],
            "intent": intent,
        }
        await self.col.insert_one(dict(doc))
        return doc

    async def list(self, user_id: str, session_id: str, *, limit: int = 500) -> List[Dict[str, Any]]:
        cursor = (
            self.col.find({"session_id": session_id, "user_id": user_id}, {"_id": 0})
            .sort([("created_at", 1)])
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        return [self.to_wire(d) for d in docs]

    @staticmethod
    def to_wire(doc: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": doc["id"],
            "session_id": doc["session_id"],
            "turn_id": doc["turn_id"],
            "role": doc["role"],
            "created_at": doc["created_at"],
            "text": doc.get("text"),
            "format": doc.get("format") or "plain",
            "attachments": doc.get("attachments") or [],
            "surface_ids": doc.get("surface_ids") or [],
            "intent": doc.get("intent"),
        }


class TurnRepository:
    def __init__(self, db):
        self.col = db[TURNS]

    async def find_by_client_id(
        self, user_id: str, client_turn_id: str, *, session_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        query: Dict[str, Any] = {"user_id": user_id, "client_turn_id": client_turn_id}
        if session_id is not None:
            query["session_id"] = session_id
        return strip_mongo(await self.col.find_one(query, {"_id": 0}))

    async def create(self, doc: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        """Insert a turn. Returns ``(doc, created)``; a duplicate ``client_turn_id`` returns the original."""
        try:
            await self.col.insert_one(dict(doc))
            return doc, True
        except DuplicateKeyError:
            existing = await self.find_by_client_id(doc["user_id"], doc["client_turn_id"], session_id=doc["session_id"])
            if existing is None:  # pragma: no cover - index on a different key
                raise
            return existing, False

    async def get(self, user_id: str, session_id: str, turn_id: str) -> Optional[Dict[str, Any]]:
        return strip_mongo(
            await self.col.find_one({"id": turn_id, "session_id": session_id, "user_id": user_id}, {"_id": 0})
        )

    async def get_internal(self, turn_id: str) -> Optional[Dict[str, Any]]:
        return strip_mongo(await self.col.find_one({"id": turn_id}, {"_id": 0}))

    async def update(self, turn_id: str, fields: Dict[str, Any]) -> None:
        await self.col.update_one({"id": turn_id}, {"$set": fields})

    async def finish(self, turn_id: str, status: str, **fields: Any) -> bool:
        """Atomically move a running turn to a terminal status.

        Exactly one caller wins, which is what guarantees exactly one
        ``turn.completed`` / ``turn.failed`` event per turn even when a cancel
        races the runner (possibly on another worker).
        """
        doc = await self.col.find_one_and_update(
            {"id": turn_id, "status": "running"},
            {"$set": {"status": status, "ended_at": iso(), **fields}},
            projection={"_id": 0},
        )
        return doc is not None

    async def request_cancel(self, turn_id: str) -> None:
        await self.col.update_one({"id": turn_id, "status": "running"}, {"$set": {"cancel_requested": True}})

    async def is_cancel_requested(self, turn_id: str) -> bool:
        doc = await self.col.find_one({"id": turn_id}, {"_id": 0, "cancel_requested": 1, "status": 1})
        return bool(doc and (doc.get("cancel_requested") or doc.get("status") != "running"))


# --------------------------------------------------------------------------- #
# Surface snapshots
# --------------------------------------------------------------------------- #


def _unescape(token: str) -> str:
    return token.replace("~1", "/").replace("~0", "~")


def set_json_pointer(root: Any, path: Optional[str], value: Any) -> Any:
    """Apply an A2UI ``updateDataModel`` (RFC 6901 pointer; empty = replace the whole model).

    Missing intermediate objects are created; ``-`` appends to a list.
    Returns the (possibly new) root. Raises ``ValueError`` on an invalid target.
    """
    if not path:
        return copy.deepcopy(value)
    if not path.startswith("/"):
        raise ValueError("JSON pointer must start with '/'")
    tokens = [_unescape(t) for t in path.split("/")[1:]]
    if not isinstance(root, dict):
        root = {}
    node: Any = root
    for i, token in enumerate(tokens):
        last = i == len(tokens) - 1
        if isinstance(node, list):
            if token == "-":
                idx = len(node)
            elif token.isdigit():
                idx = int(token)
            else:
                raise ValueError(f"invalid list index {token!r}")
            if idx > len(node):
                raise ValueError("list index out of range")
            if last:
                if idx == len(node):
                    node.append(copy.deepcopy(value))
                else:
                    node[idx] = copy.deepcopy(value)
                return root
            if idx == len(node):
                node.append({})
            node = node[idx]
        elif isinstance(node, dict):
            if last:
                node[token] = copy.deepcopy(value)
                return root
            if not isinstance(node.get(token), (dict, list)):
                node[token] = {}
            node = node[token]
        else:
            raise ValueError("pointer traverses a scalar")
    return root


class SurfaceRepository:
    def __init__(self, db):
        self.col = db[SURFACES]

    async def get(self, user_id: str, session_id: str, surface_id: str) -> Optional[Dict[str, Any]]:
        return strip_mongo(
            await self.col.find_one(
                {"surface_id": surface_id, "session_id": session_id, "user_id": user_id, "deleted": False},
                {"_id": 0},
            )
        )

    async def list(self, user_id: str, session_id: str) -> List[Dict[str, Any]]:
        cursor = self.col.find({"session_id": session_id, "user_id": user_id, "deleted": False}, {"_id": 0}).sort(
            [("updated_at", 1)]
        )
        docs = await cursor.to_list(length=200)
        return [self.to_wire(d) for d in docs]

    @staticmethod
    def to_wire(doc: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "surface_id": doc["surface_id"],
            "session_id": doc["session_id"],
            "turn_id": doc["turn_id"],
            "catalog_id": FORGE_CATALOG_ID,
            "title": (doc.get("title") or "")[:200],
            "components": doc.get("components") or [],
            "data_model": doc.get("data_model") or {},
            "version": int(doc.get("version") or 0),
            "updated_at": doc["updated_at"],
        }

    async def apply(
        self,
        *,
        user_id: str,
        session_id: str,
        turn_id: Optional[str],
        message: Dict[str, Any],
        title: Optional[str] = None,
        capability_id: Optional[str] = None,
    ) -> None:
        """Fold one (already validated) A2UI v1.0 message into the snapshot."""
        now = iso()
        if "createSurface" in message:
            body = message["createSurface"]
            sid = body["surfaceId"]
            existing = await self.col.find_one({"surface_id": sid}, {"_id": 0, "user_id": 1, "session_id": 1})
            if existing and (existing.get("user_id") != user_id or existing.get("session_id") != session_id):
                raise OsHTTPError(409, "conflict", "surface id already in use")
            doc = {
                "surface_id": sid,
                "session_id": session_id,
                "user_id": user_id,
                "turn_id": turn_id or "none",
                "title": (title or "")[:200],
                "capability_id": capability_id,
                "components": list(body.get("components") or [])[:MAX_SURFACE_COMPONENTS],
                "data_model": body.get("dataModel") or {},
                "version": 0,
                "deleted": False,
                "updated_at": now,
            }
            self._check_size(doc["data_model"])
            await self.col.update_one({"surface_id": sid}, {"$set": doc}, upsert=True)
            return

        if "deleteSurface" in message:
            sid = message["deleteSurface"]["surfaceId"]
            await self.col.update_one(
                {"surface_id": sid, "session_id": session_id, "user_id": user_id},
                {"$set": {"deleted": True, "updated_at": now}},
            )
            return

        body = message.get("updateComponents") or message.get("updateDataModel") or {}
        sid = body.get("surfaceId")
        doc = await self.get(user_id, session_id, sid)
        if doc is None:
            raise not_found("Surface not found")
        if "updateComponents" in message:
            by_id = {c["id"]: c for c in doc.get("components") or []}
            order = [c["id"] for c in doc.get("components") or []]
            for comp in body["components"]:
                if comp["id"] not in by_id:
                    order.append(comp["id"])
                by_id[comp["id"]] = comp
            components = [by_id[i] for i in order][:MAX_SURFACE_COMPONENTS]
            fields: Dict[str, Any] = {"components": components}
        else:
            data_model = set_json_pointer(doc.get("data_model") or {}, body.get("path"), body.get("value"))
            self._check_size(data_model)
            fields = {"data_model": data_model}
        fields["updated_at"] = now
        await self.col.update_one(
            {"surface_id": sid, "session_id": session_id, "user_id": user_id},
            {"$set": fields, "$inc": {"version": 1}},
        )

    @staticmethod
    def _check_size(data_model: Any) -> None:
        if len(json.dumps(data_model, default=str)) > MAX_DATA_MODEL_BYTES:
            raise ValueError("surface data model exceeds the size cap")


# --------------------------------------------------------------------------- #
# Workspaces (optimistic concurrency on ``version``)
# --------------------------------------------------------------------------- #

_WORKSPACE_FIELDS = ("id", "name", "version", "active_session_id", "nav_collapsed", "layout", "windows", "updated_at")


def workspace_wire(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: doc.get(k) for k in _WORKSPACE_FIELDS}


class WorkspaceRepository:
    def __init__(self, db):
        self.col = db[WORKSPACES]

    async def get_current(self, user_id: str) -> Dict[str, Any]:
        doc = await self.col.find_one({"user_id": user_id, "current": True}, {"_id": 0})
        if doc:
            return workspace_wire(doc)
        doc = {
            "id": new_id("wsp"),
            "user_id": user_id,
            "current": True,
            "name": "Workspace",
            "version": 0,
            "active_session_id": None,
            "nav_collapsed": False,
            "layout": "free",
            "windows": [],
            "updated_at": iso(),
        }
        try:
            await self.col.insert_one(dict(doc))
        except DuplicateKeyError:  # concurrent first load
            again = await self.col.find_one({"user_id": user_id, "current": True}, {"_id": 0})
            if again:
                return workspace_wire(again)
            raise
        return workspace_wire(doc)

    async def put(self, user_id: str, workspace_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
        """Store ``state`` if its ``version`` matches; the stored version becomes ``version + 1``.

        Raises 409 (with the current state in ``extra``) on a mismatch, 404 for a
        workspace the caller does not own.
        """
        current = await self.col.find_one({"id": workspace_id, "user_id": user_id}, {"_id": 0})
        if current is None:
            raise not_found("Workspace not found")
        fields = {k: state[k] for k in _WORKSPACE_FIELDS if k not in ("id", "version", "updated_at")}
        fields["updated_at"] = iso()
        fields["version"] = int(state["version"]) + 1
        doc = await self.col.find_one_and_update(
            {"id": workspace_id, "user_id": user_id, "version": int(state["version"])},
            {"$set": fields},
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            latest = await self.col.find_one({"id": workspace_id, "user_id": user_id}, {"_id": 0})
            raise OsHTTPError(409, "conflict", "Workspace version conflict", extra={"current": workspace_wire(latest or current)})
        return workspace_wire(doc)
