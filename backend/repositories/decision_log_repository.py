"""Repository for the unified decision_log collection (Phase A).

Follows the same thin async-wrapper pattern as
``agent_registry/repository.py`` and ``engineering_repository.py``.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Callable

from core.database import get_db as _default_get_db

logger = logging.getLogger(__name__)

DECISION_LOG_COLLECTION = "decision_log"

_get_db: Callable = _default_get_db


def set_get_db(fn: Callable) -> None:
    global _get_db
    _get_db = fn


class DecisionLogRepository:
    async def insert(self, doc: Dict[str, Any]) -> None:
        db = await _get_db()
        await db[DECISION_LOG_COLLECTION].insert_one(doc)

    async def find_by_project(
        self,
        project_id: str,
        *,
        status: Optional[str] = None,
        category: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        sort: Optional[List[tuple]] = None,
    ) -> List[Dict[str, Any]]:
        db = await _get_db()
        query: Dict[str, Any] = {"project_id": project_id}
        if status is not None:
            query["status"] = status
        if category is not None:
            query["category"] = category
        cursor = db[DECISION_LOG_COLLECTION].find(query, {"_id": 0})
        if sort:
            cursor = cursor.sort(sort)
        cursor = cursor.skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def find_by_initiative(self, initiative_id: str, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        db = await _get_db()
        cursor = db[DECISION_LOG_COLLECTION].find(
            {"initiative_id": initiative_id}, {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def count_by_project(self, project_id: str, *, status: Optional[str] = None) -> int:
        db = await _get_db()
        query: Dict[str, Any] = {"project_id": project_id}
        if status is not None:
            query["status"] = status
        return await db[DECISION_LOG_COLLECTION].count_documents(query)

    async def get_recent(self, project_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        return await self.find_by_project(
            project_id,
            skip=0,
            limit=limit,
            sort=[("created_at", -1)],
        )
