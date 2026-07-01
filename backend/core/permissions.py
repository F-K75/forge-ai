"""Shared ownership/membership checks for resources shared within an org."""


async def has_build_access(db, user_id: str, build: dict) -> bool:
    """Return True if user_id owns the build or shares an org with its project."""
    if not build:
        return False
    if build.get("user_id") == user_id:
        return True

    project_id = build.get("project_id")
    if not project_id:
        return False

    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        return False

    org_id = project.get("org_id")
    if not org_id:
        return False

    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user_id}, {"_id": 0}
    )
    return membership is not None
