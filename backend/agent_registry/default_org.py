"""Default org-chart template used to seed a new project's engineering org.

Mirrors the department/role structure Forge's product vision specifies:
leadership (CTO/PM/Tech Lead/Architect) plus Frontend, Backend, AI,
Infrastructure, QA, Documentation, Research, and Release departments. This is
only the *starting roster* -- `AgentRegistry.get_or_create_agent` spins up
additional specialists on demand for roles not listed here (e.g. a
"graphql_engineer"), and those become permanent members of the org too.
"""

from __future__ import annotations

from typing import Dict, List

# Leadership roles are tracked on EngineeringOrg.leadership rather than in a
# department bucket, but still get AgentProfile rows in the "leadership"
# department so they show up in listings.
LEADERSHIP_ROLES: List[str] = ["cto", "product_manager", "tech_lead", "architect"]

# department_key -> (display name, [default role slugs])
DEFAULT_DEPARTMENTS: Dict[str, Dict[str, object]] = {
    "leadership": {
        "name": "Leadership",
        "roles": LEADERSHIP_ROLES,
    },
    "frontend": {
        "name": "Frontend",
        "roles": ["react_engineer", "ui_engineer", "ux_engineer", "accessibility_engineer"],
    },
    "backend": {
        "name": "Backend",
        "roles": ["api_engineer", "database_engineer", "auth_engineer", "performance_engineer"],
    },
    "ai": {
        "name": "AI",
        "roles": ["prompt_engineer", "context_engineer", "rag_engineer", "evaluation_engineer"],
    },
    "infrastructure": {
        "name": "Infrastructure",
        "roles": ["devops_engineer", "kubernetes_engineer", "security_engineer", "cloud_engineer"],
    },
    "qa": {
        "name": "QA",
        "roles": ["test_engineer", "regression_engineer", "benchmark_engineer"],
    },
    "documentation": {
        "name": "Documentation",
        "roles": ["documentation_engineer"],
    },
    "research": {
        "name": "Research",
        "roles": ["research_engineer"],
    },
    "release": {
        "name": "Release",
        "roles": ["release_manager"],
    },
}

# Department new specialists get filed under when their role isn't recognized
# anywhere in DEFAULT_DEPARTMENTS.
SPECIALISTS_DEPARTMENT_KEY = "specialists"
SPECIALISTS_DEPARTMENT_NAME = "Specialists"


def display_name_for_role(role: str) -> str:
    """Turn a role slug like 'graphql_engineer' into 'Graphql Engineer'."""
    return " ".join(part.capitalize() for part in role.split("_"))


def department_for_role(role: str) -> str:
    """Look up which default department a role belongs to; falls back to
    the catch-all Specialists department for dynamically created roles."""
    for key, spec in DEFAULT_DEPARTMENTS.items():
        if role in spec["roles"]:
            return key
    return SPECIALISTS_DEPARTMENT_KEY
