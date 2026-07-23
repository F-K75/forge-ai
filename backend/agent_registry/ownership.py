"""Code ownership: reverse-lookup and advisory checks over AgentProfile.owned_paths.

Each persistent agent's `owned_paths` (populated by `AgentRegistry.record_task_result`
as real work happens -- see `core/orchestrator.py`'s wiring) is the empirical
record of who has actually touched what in a project. This module turns that
into: "who owns this file?", "does this changeset cross into someone else's
territory?", and a per-agent ownership summary for a future dashboard.

This is deliberately advisory, not a hard gate: the current build pipeline
runs a single DeveloperAgent (and a Debugger patching its own output) across
the whole generated app, so an automatic block on "someone else touched this
file" would fire on completely legitimate debug-loop patches. Once execution
is split across specialist agents that each really do own a slice of the
tree, `check_change` is the primitive a PR workflow would call to gate merges.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .registry import AgentRegistry, get_agent_registry

Status = str  # "owned_by_you" | "unclaimed" | "owned_by_other"


@dataclass
class OwnershipEntry:
    agent_id: str
    role: str
    department: str
    display_name: str


@dataclass
class OwnershipCheckResult:
    path: str
    status: Status
    owner_agent_id: Optional[str] = None
    owner_role: Optional[str] = None


@dataclass
class AgentOwnershipSummary:
    agent_id: str
    role: str
    department: str
    display_name: str
    file_count: int
    top_level_breakdown: Dict[str, int]


class CodeOwnership:
    def __init__(self, registry: Optional[AgentRegistry] = None):
        self._registry = registry or get_agent_registry()

    async def owners_for_paths(
        self, project_id: str, paths: List[str]
    ) -> Dict[str, List[OwnershipEntry]]:
        """path -> agents whose owned_paths include it. Usually 0 or 1 entry,
        but nothing stops two agents from having independently touched the
        same file across different tasks, so this returns all of them."""
        agents = await self._registry.list_agents(project_id)
        result: Dict[str, List[OwnershipEntry]] = {p: [] for p in paths}
        for agent in agents:
            owned_set = set(agent.owned_paths)
            entry = OwnershipEntry(
                agent_id=agent.id,
                role=agent.role,
                department=agent.department,
                display_name=agent.display_name,
            )
            for p in paths:
                if p in owned_set:
                    result[p].append(entry)
        return result

    async def check_change(
        self, project_id: str, proposing_agent_id: str, paths: List[str]
    ) -> List[OwnershipCheckResult]:
        """Classify each path relative to `proposing_agent_id`:
        - "owned_by_you": the proposing agent has touched this path before.
        - "unclaimed": no agent has recorded ownership of this path yet.
        - "owned_by_other": a different agent currently owns it -- the
          changeset should probably get that agent's review.
        """
        owners_map = await self.owners_for_paths(project_id, paths)
        results: List[OwnershipCheckResult] = []
        for p in paths:
            owners = owners_map[p]
            if not owners:
                results.append(OwnershipCheckResult(path=p, status="unclaimed"))
                continue
            mine = next((o for o in owners if o.agent_id == proposing_agent_id), None)
            if mine:
                results.append(
                    OwnershipCheckResult(
                        path=p, status="owned_by_you",
                        owner_agent_id=mine.agent_id, owner_role=mine.role,
                    )
                )
            else:
                other = owners[0]
                results.append(
                    OwnershipCheckResult(
                        path=p, status="owned_by_other",
                        owner_agent_id=other.agent_id, owner_role=other.role,
                    )
                )
        return results

    async def ownership_summary(self, project_id: str) -> List[AgentOwnershipSummary]:
        """Per-agent breakdown of what they own, bucketed by top-level path
        segment -- e.g. {"frontend": 12, "backend": 3} -- for a future
        ownership dashboard. Agents that own nothing yet are omitted."""
        agents = await self._registry.list_agents(project_id)
        summary: List[AgentOwnershipSummary] = []
        for agent in agents:
            if not agent.owned_paths:
                continue
            top_level: Dict[str, int] = {}
            for p in agent.owned_paths:
                top = p.split("/", 1)[0] if "/" in p else p
                top_level[top] = top_level.get(top, 0) + 1
            summary.append(
                AgentOwnershipSummary(
                    agent_id=agent.id,
                    role=agent.role,
                    department=agent.department,
                    display_name=agent.display_name,
                    file_count=len(agent.owned_paths),
                    top_level_breakdown=top_level,
                )
            )
        return summary


_code_ownership: Optional[CodeOwnership] = None


def get_code_ownership() -> CodeOwnership:
    global _code_ownership
    if _code_ownership is None:
        _code_ownership = CodeOwnership()
    return _code_ownership
