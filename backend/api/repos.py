from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import os
import tempfile
import asyncio
import logging
from urllib.parse import urlparse

from git import Repo
from core.models import Project, User
from core.database import get_db
from core.encryption import decrypt_field
from api.auth import get_current_user
from core.config import get_settings

router = APIRouter(prefix="/repos", tags=["repos"])
settings = get_settings()
logger = logging.getLogger(__name__)


class ImportRepoRequest(BaseModel):
    repo_url: str = Field(..., max_length=500)
    project_name: Optional[str] = Field(None, max_length=200)
    branch: str = Field("main", max_length=100)
    github_token: Optional[str] = Field(None, max_length=200)

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("repo_url is required")
        if value.startswith(("http://", "https://")):
            parsed = urlparse(value)
            if parsed.netloc not in {"github.com", "www.github.com", "gitlab.com", "www.gitlab.com", "bitbucket.org", "www.bitbucket.org"}:
                raise ValueError("repo_url must be a github.com, gitlab.com, or bitbucket.org URL")
            parts = [p for p in parsed.path.split("/") if p]
            if len(parts) < 2:
                raise ValueError("repo_url must be in the form https://host/owner/repo")
        else:
            parts = value.split("/")
            if len(parts) < 2 or not all(parts):
                raise ValueError("repo_url must be in the form owner/repo or https://host/owner/repo")
        return value


class ImportRepoResponse(BaseModel):
    project: Project
    files_indexed: int


def _clone_repo_sync(repo_url: str, target_dir: str, branch: str, github_token: Optional[str]) -> None:
    env = os.environ.copy()
    if github_token:
        askpass = os.path.join(target_dir, ".git-askpass.sh")
        with open(askpass, "w") as f:
            f.write("#!/bin/sh\necho \"$GITHUB_TOKEN\"\n")
        os.chmod(askpass, 0o700)
        env["GIT_ASKPASS"] = askpass
        env["GITHUB_TOKEN"] = github_token

    Repo.clone_from(repo_url, target_dir, branch=branch, env=env, depth=1)


async def _clone_repo(repo_url: str, target_dir: str, branch: str, github_token: Optional[str]) -> None:
    await asyncio.to_thread(_clone_repo_sync, repo_url, target_dir, branch, github_token)


def _count_files(directory: str) -> int:
    count = 0
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d != ".git"]
        count += len(files)
    return count


@router.post("/import", response_model=ImportRepoResponse)
async def import_repo(
    req: ImportRepoRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()

    github_token = req.github_token
    if not github_token and current_user.github_token:
        github_token = decrypt_field(current_user.github_token)

    temp_dir = tempfile.mkdtemp(prefix="forge-repo-import-")
    try:
        await _clone_repo(req.repo_url, temp_dir, req.branch, github_token)
    except Exception as exc:
        logger.exception("Failed to clone repo %s", req.repo_url)
        raise HTTPException(status_code=400, detail=f"Failed to clone repository: {exc}") from exc

    repo_name = req.project_name or os.path.basename(temp_dir) or "Imported Repo"
    project = Project(
        user_id=current_user.id,
        name=repo_name,
        description=f"Imported from {req.repo_url}",
        github_repo=req.repo_url,
        github_branch=req.branch,
    )
    await db.projects.insert_one(project.model_dump())

    files_indexed = _count_files(temp_dir)

    return ImportRepoResponse(project=project, files_indexed=files_indexed)
