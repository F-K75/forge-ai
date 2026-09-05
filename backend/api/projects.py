from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse
from core.models import Project, User, PaginationParams, utcnow
from core.database import get_db, paginated_query, get_redis
from core.audit import record_audit_log
from core.permissions import has_project_access
from api.auth import get_current_user
from api.billing import get_max_projects_for_user

router = APIRouter(prefix="/projects", tags=["projects"])

PROJECT_CREATE_RATE_LIMIT = 10
PROJECT_CREATE_RATE_WINDOW = 60


async def _check_project_create_rate_limit(user_id: str) -> None:
    try:
        redis = await get_redis()
        key = f"rl:project_create:{user_id}"
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, PROJECT_CREATE_RATE_WINDOW)
        if current > PROJECT_CREATE_RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Too many project creations. Please wait before creating another.",
            )
    except HTTPException:
        raise
    except Exception:
        pass


def _validate_github_repo(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    value = value.strip()
    if not value:
        return value
    if value.startswith(("http://", "https://")):
        parsed = urlparse(value)
        if parsed.netloc not in {"github.com", "www.github.com"}:
            raise ValueError("github_repo must be a github.com URL")
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) < 2:
            raise ValueError("github_repo must be in the form https://github.com/owner/repo")
        return value
    parts = value.split("/")
    if len(parts) != 2 or not all(parts):
        raise ValueError("github_repo must be in the form owner/repo")
    return value


def _validate_url(value: Optional[str], field_name: str) -> Optional[str]:
    if value is None or value == "":
        return value
    value = value.strip()
    if not value:
        return value
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{field_name} must be a valid URL")
    return value


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
    deployed_url: Optional[str] = Field(None, max_length=500)
    template: Optional[str] = Field(None, max_length=100)

    @field_validator("github_repo")
    @classmethod
    def validate_github_repo(cls, value: Optional[str]) -> Optional[str]:
        return _validate_github_repo(value)

    @field_validator("deployed_url")
    @classmethod
    def validate_deployed_url(cls, value: Optional[str]) -> Optional[str]:
        return _validate_url(value, "deployed_url")


@router.post("/")
async def create_project(req: CreateProjectRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()

    await _check_project_create_rate_limit(current_user.id)

    max_projects = await get_max_projects_for_user(db, current_user.id)
    if max_projects >= 0:
        current_count = await db.projects.count_documents({"user_id": current_user.id, "deleted_at": None})
        if current_count >= max_projects:
            raise HTTPException(
                status_code=402,
                detail="Project limit reached. Upgrade to create more.",
            )

    project = Project(
        user_id=current_user.id,
        name=req.name,
        description=req.description,
        template=req.template,
    )
    await db.projects.insert_one(project.model_dump())
    await record_audit_log(
        db, None, current_user, "create_project", "project",
        resource_id=project.id, changes={"name": req.name},
    )
    return project


@router.get("/", response_model=PaginatedProjects)
async def list_projects(
    current_user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()
    result = await paginated_query(
        db.projects,
        {"user_id": current_user.id, "deleted_at": None},
        page=params.page,
        per_page=params.per_page,
        sort=[("updated_at", -1)],
    )
    return PaginatedProjects(
        projects=result.items,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


@router.get("/{project_id}")
async def get_project(project_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, current_user.id, project):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/builds", response_model=PaginatedProjectBuilds)
async def get_project_builds(
    project_id: str,
    current_user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, current_user.id, project):
        raise HTTPException(status_code=404, detail="Project not found")

    result = await paginated_query(
        db.builds,
        {"project_id": project_id},
        page=params.page,
        per_page=params.per_page,
        sort=[("created_at", -1)],
        projection={"_id": 0, "files": 0},
    )
    return PaginatedProjectBuilds(
        builds=result.items,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


@router.put("/{project_id}")
async def update_project(project_id: str, req: UpdateProjectRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, current_user.id, project):
        raise HTTPException(status_code=404, detail="Project not found")
    
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = utcnow().isoformat()
    await db.projects.update_one({"id": project_id}, {"$set": update})
    await record_audit_log(
        db, None, current_user, "update_project", "project",
        resource_id=project_id, changes=update,
    )
    return {"ok": True}


@router.delete("/{project_id}")
async def delete_project(project_id: str, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, current_user.id, project):
        raise HTTPException(status_code=404, detail="Project not found")
    
    await db.projects.update_one({"id": project_id}, {"$set": {"deleted_at": utcnow().isoformat()}})
    await record_audit_log(
        db, request, current_user, "delete_project", "project",
        resource_id=project_id, changes={"name": project.get("name")},
    )
    return {"ok": True}
