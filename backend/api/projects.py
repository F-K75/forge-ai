from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from core.models import Project, User
from core.database import get_db
from datetime import datetime
from api.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str = Field(max_length=200)
    description: str = Field(max_length=5000)
    template: Optional[str] = Field(None, max_length=100)


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    github_repo: Optional[str] = Field(None, max_length=500)
    template: Optional[str] = Field(None, max_length=100)


@router.post("/")
async def create_project(req: CreateProjectRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = Project(
        user_id=current_user.id,
        name=req.name,
        description=req.description,
        template=req.template,
    )
    await db.projects.insert_one(project.model_dump())
    return project


@router.get("/")
async def list_projects(current_user: User = Depends(get_current_user)):
    db = await get_db()
    projects = await db.projects.find(
        {"user_id": current_user.id}, {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    return projects


@router.get("/{project_id}")
async def get_project(project_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "user_id": current_user.id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/builds")
async def get_project_builds(project_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "user_id": current_user.id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    builds = await db.builds.find(
        {"project_id": project_id, "user_id": current_user.id}, {"_id": 0, "files": 0}
    ).sort("created_at", -1).to_list(20)
    return builds


@router.put("/{project_id}")
async def update_project(project_id: str, req: UpdateProjectRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "user_id": current_user.id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = datetime.utcnow().isoformat()
    await db.projects.update_one({"id": project_id, "user_id": current_user.id}, {"$set": update})
    return {"ok": True}


@router.delete("/{project_id}")
async def delete_project(project_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "user_id": current_user.id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await db.projects.delete_one({"id": project_id, "user_id": current_user.id})
    await db.builds.delete_many({"project_id": project_id, "user_id": current_user.id})
    return {"ok": True}
