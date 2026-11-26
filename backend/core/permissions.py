"""Shared ownership/membership checks for resources shared within an org."""

from fastapi import HTTPException

from core.models import Role


async def require_org_role(db, *, user_id: str, org_id: str, allowed_roles=(Role.OWNER, Role.ADMIN)) -> dict:
    """Raise 403 unless `user_id` is a member of `org_id` with one of
    `allowed_roles`. Returns the membership doc otherwise. Factors out the
    inline `team_members.find_one(...)` + role check duplicated across
    `api/auth.py`'s organization endpoints."""
    membership = await db.team_members.find_one({"org_id": org_id, "user_id": user_id}, {"_id": 0})
    if not membership or membership["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Permission denied")
    return membership


async def is_org_member(db, *, user_id: str, org_id: str) -> bool:
    """True if `user_id` belongs to `org_id` in any role. Used where any
    member (not just owner/admin) should have access to an org-scoped
    resource -- e.g. the org's own semantic retrieval index."""
    membership = await db.team_members.find_one({"org_id": org_id, "user_id": user_id}, {"_id": 0})
    return membership is not None


async def has_initiative_access(db, user_id: str, initiative: dict) -> bool:
    """Same shape as has_build_access, for Agile PM initiatives."""
    if not initiative:
        return False
    if initiative.get("user_id") == user_id:
        return True
    org_id = initiative.get("org_id")
    if not org_id:
        return False
    membership = await db.team_members.find_one({"org_id": org_id, "user_id": user_id}, {"_id": 0})
    if not membership:
        return False
    role = membership.get("role")
    if role in (Role.OWNER.value, Role.ADMIN.value, Role.MEMBER.value):
        return True
    return False


async def has_initiative_write_access(db, user_id: str, initiative: dict) -> bool:
    """True if the user can mutate the initiative.

    Owners and admins always have write access. Members can write; viewers
    can only read. Unrecognized roles are treated as read-only.
    """
    if not initiative:
        return False
    if initiative.get("user_id") == user_id:
        return True
    org_id = initiative.get("org_id")
    if not org_id:
        return False
    membership = await db.team_members.find_one({"org_id": org_id, "user_id": user_id}, {"_id": 0})
    if not membership:
        return False
    role = membership.get("role")
    if role in (Role.OWNER.value, Role.ADMIN.value, Role.MEMBER.value):
        return True
    return False


async def has_project_access(db, user_id: str, project: dict) -> bool:
    """Return True if user_id owns the project or shares its org."""
    if not project:
        return False
    if project.get("user_id") == user_id:
        return True

    org_id = project.get("org_id")
    if not org_id:
        return False

    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user_id}, {"_id": 0}
    )
    return membership is not None


async def has_build_access(db, user_id: str, build: dict) -> bool:
    """Return True if user_id owns the build or shares an org with its project."""
    if not build:
        return False
    if build.get("user_id") == user_id:
        return True

    project_id = build.get("project_id")
    if not project_id:
        return False

    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project:
        return False

    org_id = project.get("org_id")
    if not org_id:
        return False

    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user_id}, {"_id": 0}
    )
    return membership is not None


# Org roles allowed to decide (approve/reject) a human-in-the-loop governance
# gate on a shared project they do not personally own. Members and viewers can
# see a shared project's runs but cannot sign off on its governance gates.
GATE_APPROVER_ROLES = (Role.OWNER.value, Role.ADMIN.value)


async def can_decide_project_gates(db, user_id: str, project: dict) -> bool:
    """Return True if `user_id` may approve or reject a kernel governance gate.

    The project's owner always may. For projects shared through an org, only
    org owners and admins may; plain members and viewers are read-only for
    governance decisions. Unrecognized roles are denied.
    """
    if not project:
        return False
    if project.get("user_id") == user_id:
        return True
    org_id = project.get("org_id")
    if not org_id:
        return False
    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user_id}, {"_id": 0}
    )
    if not membership:
        return False
    role = membership.get("role")
    role_value = role.value if isinstance(role, Role) else role
    return role_value in GATE_APPROVER_ROLES
