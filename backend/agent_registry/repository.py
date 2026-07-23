"""MongoDB persistence for the Agent Registry.

Follows the same repository pattern as ``engineering_repository.py``: thin
async wrappers around ``core.database.get_db()`` collections, with Pydantic
models doing validation/(de)serialization at the boundary.
"""

from __future__ import annotations

import logging
from typing import List, Optional

from core.database import get_db

from .models import AgentProfile, EngineeringOrg

logger = logging.getLogger(__name__)

ORG_COLLECTION = "engineering_orgs"
AGENT_COLLECTION = "agent_profiles"


class AgentRegistryRepository:
    """Persists EngineeringOrg and AgentProfile documents."""

    async def get_org(self, project_id: str) -> Optional[EngineeringOrg]:
        db = await get_db()
        doc = await db[ORG_COLLECTION].find_one({"project_id": project_id}, {"_id": 0})
        return EngineeringOrg(**doc) if doc else None

    async def save_org(self, org: EngineeringOrg) -> None:
        db = await get_db()
        await db[ORG_COLLECTION].update_one(
            {"project_id": org.project_id},
            {"$set": org.model_dump()},
            upsert=True,
        )

    async def save_agent(self, agent: AgentProfile) -> None:
        db = await get_db()
        await db[AGENT_COLLECTION].update_one(
            {"id": agent.id},
            {"$set": agent.model_dump()},
            upsert=True,
        )

    async def get_agent(self, project_id: str, agent_id: str) -> Optional[AgentProfile]:
        db = await get_db()
        doc = await db[AGENT_COLLECTION].find_one(
            {"id": agent_id, "project_id": project_id}, {"_id": 0}
        )
        return AgentProfile(**doc) if doc else None

    async def find_agent_by_role(self, project_id: str, role: str) -> Optional[AgentProfile]:
        db = await get_db()
        doc = await db[AGENT_COLLECTION].find_one(
            {"project_id": project_id, "role": role}, {"_id": 0}
        )
        return AgentProfile(**doc) if doc else None

    async def list_agents(self, project_id: str) -> List[AgentProfile]:
        db = await get_db()
        cursor = db[AGENT_COLLECTION].find({"project_id": project_id}, {"_id": 0}).sort(
            "created_at", 1
        )
        docs = await cursor.to_list(length=500)
        return [AgentProfile(**d) for d in docs]
