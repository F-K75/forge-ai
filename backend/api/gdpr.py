from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from datetime import datetime

from core.models import User
from core.database import get_db
from api.auth import get_current_user

router = APIRouter(prefix="/gdpr", tags=["gdpr"])


@router.get("/export")
async def export_user_data(current_user: User = Depends(get_current_user)):
    """Export all user data for GDPR compliance."""
    db = await get_db()
    
    export_data: Dict[str, Any] = {
        "user": {},
        "projects": [],
        "builds": [],
        "exported_at": datetime.utcnow().isoformat(),
    }
    
    # Get user data (without sensitive fields)
    user_doc = await db.users.find_one(
        {"id": current_user.id},
        {"_id": 0, "hashed_password": 0}
    )
    if user_doc:
        export_data["user"] = user_doc
    
    # Get projects
    projects_cursor = db.projects.find({"user_id": current_user.id}, {"_id": 0})
    async for doc in projects_cursor:
        export_data["projects"].append(doc)
    
    # Get builds (without file contents to reduce size)
    builds_cursor = db.builds.find(
        {"user_id": current_user.id},
        {"_id": 0, "files": 0}
    )
    async for doc in builds_cursor:
        export_data["builds"].append(doc)
    
    return export_data


@router.delete("/delete")
async def delete_user_data(
    confirm: bool,
    current_user: User = Depends(get_current_user)
):
    """Delete all user data for GDPR compliance."""
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Must set confirm=true to delete account"
        )
    
    db = await get_db()
    
    # Delete user projects and builds
    projects = await db.projects.find(
        {"user_id": current_user.id},
        {"_id": 0, "id": 1}
    ).to_list(None)
    
    project_ids = [p["id"] for p in projects]
    
    # Delete builds
    if project_ids:
        await db.builds.delete_many({"project_id": {"$in": project_ids}})
    
    # Delete projects
    await db.projects.delete_many({"user_id": current_user.id})
    
    # Delete builds directly
    await db.builds.delete_many({"user_id": current_user.id})
    
    # Delete user
    await db.users.delete_one({"id": current_user.id})
    
    return {"ok": True, "message": "Account deleted"}