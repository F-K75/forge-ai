from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.models import Project
from core.database import get_db
from datetime import datetime

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""
    user_id: str = "dev"


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    github_repo: Optional[str] = None


@router.post("/")
async def create_project(req: CreateProjectRequest):
    db = await get_db()
    project = Project(
        user_id=req.user_id,
        name=req.name,
        description=req.description,
    )
    await db.projects.insert_one(project.model_dump())
    return project


@router.get("/")
async def list_projects(user_id: str = "dev"):
    db = await get_db()
    projects = await db.projects.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    return projects


@router.get("/{project_id}")
async def get_project(project_id: str):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/builds")
async def get_project_builds(project_id: str):
    db = await get_db()
    builds = await db.builds.find(
        {"project_id": project_id}, {"_id": 0, "files": 0}
    ).sort("created_at", -1).to_list(20)
    return builds


@router.put("/{project_id}")
async def update_project(project_id: str, req: UpdateProjectRequest):
    db = await get_db()
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = datetime.utcnow().isoformat()
    await db.projects.update_one({"id": project_id}, {"$set": update})
    return {"ok": True}


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    db = await get_db()
    await db.projects.delete_one({"id": project_id})
    await db.builds.delete_many({"project_id": project_id})
    return {"ok": True}
