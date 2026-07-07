from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import math
from core.models import Project, User
from core.database import get_db
from core.audit import record_audit_log
from datetime import datetime
from api.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


class PaginatedProjects(BaseModel):
    projects: List[Dict[str, Any]]
    total: int
    page: int
    per_page: int
    total_pages: int


class PaginatedProjectBuilds(BaseModel):
    builds: List[Dict[str, Any]]
    total: int
    page: int
    per_page: int
    total_pages: int


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


@router.get("/", response_model=PaginatedProjects)
async def list_projects(
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    db = await get_db()
    query = {"user_id": current_user.id}
    total = await db.projects.count_documents(query)
    projects = await db.projects.find(
        query, {"_id": 0}
    ).sort("updated_at", -1).skip((page - 1) * per_page).limit(per_page).to_list(per_page)
    return PaginatedProjects(
        projects=projects,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total else 0,
    )


@router.get("/{project_id}")
async def get_project(project_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "user_id": current_user.id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/builds", response_model=PaginatedProjectBuilds)
async def get_project_builds(
    project_id: str,
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "user_id": current_user.id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = {"project_id": project_id, "user_id": current_user.id}
    total = await db.builds.count_documents(query)
    builds = await db.builds.find(
        query, {"_id": 0, "files": 0}
    ).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page).to_list(per_page)
    return PaginatedProjectBuilds(
        builds=builds,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total else 0,
    )


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
async def delete_project(project_id: str, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "user_id": current_user.id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await db.projects.delete_one({"id": project_id, "user_id": current_user.id})
    await db.builds.delete_many({"project_id": project_id, "user_id": current_user.id})
    await record_audit_log(
        db, request, current_user, "delete_project", "project",
        resource_id=project_id, changes={"name": project.get("name")},
    )
    return {"ok": True}
