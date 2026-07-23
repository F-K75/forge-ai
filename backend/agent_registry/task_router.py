"""Intelligent Task Router: classifies a free-text request ("improve dashboard
performance") into the department/role(s) that should own it, then resolves
(or creates) the persistent AgentProfile for each via the registry.

Classification is a deterministic keyword heuristic rather than an LLM call
-- cheap, testable, and good enough to route work to the right department;
it can be swapped for an LLM-backed classifier later without changing the
TaskRouter/Assignment contract below.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .registry import AgentRegistry, get_agent_registry

# role -> (department, keywords). Keywords are matched as case-insensitive
# substrings of the request text.
ROLE_KEYWORDS: Dict[str, Tuple[str, List[str]]] = {
    "react_engineer": ("frontend", ["frontend", "react", "component", "render", "dashboard", "page", "ui"]),
    "ui_engineer": ("frontend", ["ui", "layout", "visual design", "css", "styling"]),
    "ux_engineer": ("frontend", ["ux", "user experience", "usability", "user flow", "onboarding flow"]),
    "accessibility_engineer": ("frontend", ["accessibility", "a11y", "screen reader", "aria", "wcag"]),
    "api_engineer": ("backend", ["api", "endpoint", "rest", "graphql", "route"]),
    "database_engineer": ("backend", ["database", "query", "sql", "schema", "migration", "index", "mongo", "postgres"]),
    "auth_engineer": ("backend", ["auth", "login", "authentication", "authorization", "oauth", "jwt", "session", "permission"]),
    "performance_engineer": ("backend", ["performance", "latency", "slow", "speed", "optimi", "cache", "caching", "throughput"]),
    "prompt_engineer": ("ai", ["prompt", "few-shot", "system prompt"]),
    "context_engineer": ("ai", ["context window", "context assembly", "context budget"]),
    "rag_engineer": ("ai", ["rag", "retrieval augmented", "embedding", "vector search", "semantic search"]),
    "evaluation_engineer": ("ai", ["evaluation", "eval suite", "llm judge", "benchmark accuracy"]),
    "devops_engineer": ("infrastructure", ["ci/cd", "pipeline", "docker", "devops", "monitoring", "observability", "alert"]),
    "kubernetes_engineer": ("infrastructure", ["kubernetes", "k8s", "pod", "helm"]),
    "security_engineer": ("infrastructure", ["security", "vulnerability", "csrf", "xss", "injection", "exploit", "secret leak", "ssrf"]),
    "cloud_engineer": ("infrastructure", ["aws", "gcp", "azure", "cloud", "terraform", "infrastructure"]),
    "test_engineer": ("qa", ["unit test", "test coverage", "write tests", "testing"]),
    "regression_engineer": ("qa", ["regression", "flaky test", "broke again", "broken again"]),
    "benchmark_engineer": ("qa", ["benchmark", "load test", "stress test"]),
    "documentation_engineer": ("documentation", ["docs", "documentation", "readme", "changelog"]),
    "research_engineer": ("research", ["research", "investigate", "prototype", "explore options"]),
    "release_manager": ("release", ["release", "rollout", "version bump", "publish release"]),
}

# Used when no keyword matches anything -- routed to a general specialist
# rather than silently dropped.
DEFAULT_ROLE = ("developer", "specialists")


@dataclass
class RoleMatch:
    role: str
    department: str
    score: int
    matched_keywords: List[str] = field(default_factory=list)


@dataclass
class Assignment:
    role: str
    department: str
    agent_id: str
    display_name: str
    score: int
    matched_keywords: List[str]


def classify(request_text: str, max_matches: int = 3) -> List[RoleMatch]:
    """Rank roles by number of matched keywords; falls back to a single
    generic "developer" match when nothing matches."""
    text = request_text.lower()
    matches: List[RoleMatch] = []
    for role, (department, keywords) in ROLE_KEYWORDS.items():
        matched = [kw for kw in keywords if kw in text]
        if matched:
            matches.append(RoleMatch(role=role, department=department, score=len(matched), matched_keywords=matched))

    matches.sort(key=lambda m: m.score, reverse=True)
    if not matches:
        role, department = DEFAULT_ROLE
        matches = [RoleMatch(role=role, department=department, score=0, matched_keywords=[])]
    return matches[:max_matches]


class TaskRouter:
    def __init__(self, registry: Optional[AgentRegistry] = None):
        self._registry = registry or get_agent_registry()

    async def route(self, project_id: str, request_text: str, max_assignments: int = 3) -> List[Assignment]:
        """Classify `request_text` and resolve/create the persistent agent
        for each matched role. Guaranteed non-empty (falls back to a
        generic developer specialist)."""
        matches = classify(request_text, max_matches=max_assignments)
        assignments: List[Assignment] = []
        for m in matches:
            agent, _ = await self._registry.get_or_create_agent(
                project_id, m.role, department=m.department
            )
            assignments.append(
                Assignment(
                    role=m.role,
                    department=m.department,
                    agent_id=agent.id,
                    display_name=agent.display_name,
                    score=m.score,
                    matched_keywords=m.matched_keywords,
                )
            )
        return assignments


_task_router: Optional[TaskRouter] = None


def get_task_router() -> TaskRouter:
    global _task_router
    if _task_router is None:
        _task_router = TaskRouter()
    return _task_router
