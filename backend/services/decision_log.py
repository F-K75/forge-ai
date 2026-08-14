"""Service layer for the unified decision_log (Phase A).

Provides:
- write decisions
- query by project / initiative
- recent history
- pending decisions
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from core.models import utcnow
from repositories.decision_log_repository import DecisionLogRepository

logger = logging.getLogger(__name__)

_repo = DecisionLogRepository()


class DecisionLogService:
    async def record_decision(self, doc: Dict[str, Any]) -> None:
        doc.setdefault("created_at", utcnow())
        doc.setdefault("status", "pending")
        await _repo.insert(doc)

    async def list_for_project(
        self,
        project_id: str,
        *,
        status: Optional[str] = None,
        category: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Dict[str, Any]:
        page = max(page, 1)
        per_page = max(1, min(per_page, 100))
        skip = (page - 1) * per_page
        items = await _repo.find_by_project(
            project_id,
            status=status,
            category=category,
            skip=skip,
            limit=per_page,
            sort=[("created_at", -1)],
        )
        total = await _repo.count_by_project(project_id, status=status)
        total_pages = max(1, (total + per_page - 1) // per_page) if total > 0 else 1
        if page > total_pages:
            page = total_pages
        return {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    async def list_for_initiative(self, initiative_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        return await _repo.find_by_initiative(initiative_id, limit=limit)

    async def recent_for_project(self, project_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        return await _repo.get_recent(project_id, limit=limit)

    async def pending_for_project(self, project_id: str) -> List[Dict[str, Any]]:
        return await _repo.find_by_project(
            project_id,
            status="pending",
            sort=[("created_at", -1)],
        )
