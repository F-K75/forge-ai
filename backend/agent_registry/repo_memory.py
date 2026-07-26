"""Repository Memory: a per-repository knowledge store distinct from the
per-agent registry.

The product vision calls for everything about a repository -- architecture,
business logic, folder purposes, tech stack, API map, database schema,
feature map, dependencies, known issues, current sprint, long-term roadmap,
decision log, design system, benchmarks, performance history, security
history, release history -- to be searchable. This module is a first, honest
slice of that: a single structured, editable memory document per project.
It is NOT auto-populated by introspecting code (that would require deep
static analysis this pass doesn't have time for); agents and humans write to
it directly, the same way a README or ARCHITECTURE.md is maintained by hand.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from core.database import get_db

from .registry import AgentNotFound, AgentRegistry, get_agent_registry

# Re-exported so callers (e.g. api/repo_memory.py) can catch it without
# reaching into `.registry` directly -- `update()` lets this propagate
# unmodified whenever `updated_by_agent_id` isn't a real agent.
__all__ = [
    "RepositoryMemory",
    "RepositoryMemoryRepository",
    "RepositoryMemoryService",
    "AgentNotFound",
    "get_repository_memory_service",
]

REPO_MEMORY_COLLECTION = "repository_memory"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class RepositoryMemory(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("repomem"))
    project_id: str
    architecture_summary: str = ""
    tech_stack: List[str] = Field(default_factory=list)
    # Freeform entries like {"method": "GET", "path": "/v1/...", "description":
    # "..."} -- no validation on shape beyond being a dict, this is
    # descriptive not authoritative.
    api_map: List[Dict[str, str]] = Field(default_factory=list)
    database_schema_notes: str = ""
    known_issues: List[str] = Field(default_factory=list)
    roadmap_notes: str = ""
    design_system_notes: str = ""
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
    updated_by_agent_id: Optional[str] = None


# Fields that `RepositoryMemoryService.update` is allowed to partially set.
UPDATABLE_FIELDS = (
    "architecture_summary",
    "tech_stack",
    "api_map",
    "database_schema_notes",
    "known_issues",
    "roadmap_notes",
    "design_system_notes",
)


class RepositoryMemoryRepository:
    """Persists RepositoryMemory documents -- one per project, upserted by
    the natural `project_id` key rather than the generated `id`."""

    async def get(self, project_id: str) -> Optional[RepositoryMemory]:
        db = await get_db()
        doc = await db[REPO_MEMORY_COLLECTION].find_one(
            {"project_id": project_id}, {"_id": 0}
        )
        return RepositoryMemory(**doc) if doc else None

    async def save(self, memory: RepositoryMemory) -> None:
        db = await get_db()
        await db[REPO_MEMORY_COLLECTION].update_one(
            {"project_id": memory.project_id},
            {"$set": memory.model_dump()},
            upsert=True,
        )


class RepositoryMemoryService:
    def __init__(
        self,
        registry: Optional[AgentRegistry] = None,
        repo: Optional[RepositoryMemoryRepository] = None,
    ):
        self._registry = registry or get_agent_registry()
        self._repo = repo or RepositoryMemoryRepository()

    async def get_or_create(self, project_id: str) -> RepositoryMemory:
        memory = await self._repo.get(project_id)
        if memory:
            return memory
        memory = RepositoryMemory(project_id=project_id)
        await self._repo.save(memory)
        return memory

    async def update(
        self,
        project_id: str,
        *,
        updated_by_agent_id: str,
        **fields: Any,
    ) -> RepositoryMemory:
        """Partial update: only keys actually passed in `fields` are applied,
        so unset fields never get clobbered with None/defaults. Raises
        AgentNotFound (propagated from the registry) if `updated_by_agent_id`
        isn't a real agent in this project's org."""
        await self._registry.get_agent(project_id, updated_by_agent_id)

        memory = await self.get_or_create(project_id)
        for key, value in fields.items():
            if key in UPDATABLE_FIELDS and value is not None:
                setattr(memory, key, value)

        memory.updated_at = _now()
        memory.updated_by_agent_id = updated_by_agent_id
        await self._repo.save(memory)
        return memory


_repo_memory_service: Optional[RepositoryMemoryService] = None


def get_repository_memory_service() -> RepositoryMemoryService:
    global _repo_memory_service
    if _repo_memory_service is None:
        _repo_memory_service = RepositoryMemoryService()
    return _repo_memory_service
