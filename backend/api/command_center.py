"""Command Center fleet summary: stat tiles with comparisons + activity feed.

``GET /v1/command-center/summary?window=24h`` aggregates every project the
caller can access (owned, or shared through an org membership). See
``core.command_center`` for how each value and comparison is derived and why a
comparison may be ``null``.
"""

from __future__ import annotations

from typing import Any, Dict, Literal

from fastapi import APIRouter, Depends, Query

from api.auth import get_current_user
from core.agent_kernel import get_agent_kernel
from core.cache import cached_read, invalidate_cache
from core.command_center import build_command_center_summary
from core.database import get_db
from core.llm.budget_manager import get_budget_manager
from core.models import User

router = APIRouter(prefix="/command-center", tags=["command-center"])

# The page polls every 30s; a short TTL absorbs bursts (several tabs, the nav
# rail and the page mounting together) without hiding fresh gate decisions
# for long. Gate decisions also invalidate the decider's entry.
SUMMARY_CACHE_TTL = 10


def summary_cache_key(user_id: str, window: str = "24h") -> str:
    return f"cache:command-center:summary:v1:{user_id}:{window}"


async def invalidate_summary_cache(user_id: str) -> None:
    await invalidate_cache(summary_cache_key(user_id))


@router.get("/summary")
async def get_command_center_summary(
    window: Literal["24h"] = Query("24h", description="Comparison window. Only 24h is supported."),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Fleet stat tiles (current + comparison values) and the 20 most recent
    run / gate / deploy events across the caller's accessible projects."""
    db = await get_db()

    async def _load() -> Dict[str, Any]:
        return await build_command_center_summary(
            db,
            current_user.id,
            kernel=get_agent_kernel(),
            budget_manager=get_budget_manager(),
            window=window,
        )

    return await cached_read(summary_cache_key(current_user.id, window), SUMMARY_CACHE_TTL, _load)
