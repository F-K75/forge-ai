"""Collaboration panel hydration (collaboration protocol v2, contract §7).

``GET /builds/{build_id}/collaboration`` returns everything the panel shows
-- messages, blackboard decisions, escalations and the collaboration budget
-- derived from the build document, which is the source of truth. The
client calls it on every (re)connect and then applies WebSocket events,
de-duplicating by id. Legacy builds report ``protocol_version: 1`` with
their messages and empty decisions and escalations.

The route is served at the canonical ``/v1/builds/...`` path and at the
deprecated root path, like every other build endpoint (see api/v1.py).
"""

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_current_user
from core.collaboration import collaboration_view
from core.config import get_settings
from core.database import get_db
from core.models import User
from core.permissions import has_build_access

settings = get_settings()

_PROJECTION = {
    "_id": 0,
    "id": 1,
    "user_id": 1,
    "project_id": 1,
    "credits_used": 1,
    "reserved_credits": 1,
    "agent_messages": 1,
    "collab_config": 1,
    "blackboard": 1,
    "escalations": 1,
}


async def get_build_collaboration(build_id: str, current_user: User = Depends(get_current_user)) -> dict:
    db = await get_db()
    build = await db.builds.find_one({"id": build_id}, _PROJECTION)
    if not build or not await has_build_access(db, current_user.id, build):
        raise HTTPException(status_code=404, detail="Build not found")
    return collaboration_view(build, legacy_max_messages=settings.developer_clarification_max_questions)


router = APIRouter(tags=["collaboration"])
for _prefix in ("/v1/builds", "/builds"):
    router.add_api_route(
        f"{_prefix}/{{build_id}}/collaboration",
        get_build_collaboration,
        methods=["GET"],
        name=f"get_build_collaboration{'_v1' if _prefix.startswith('/v1') else ''}",
    )
