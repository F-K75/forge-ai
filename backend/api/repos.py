from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import os
import re
import shutil
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


_SHORTHAND_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$")
_ALLOWED_GIT_HOSTS = {
    "github.com",
    "www.github.com",
    "gitlab.com",
    "www.gitlab.com",
    "bitbucket.org",
    "www.bitbucket.org",
}


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
        if value.startswith("-"):
            raise ValueError("repo_url must not start with '-'")
        if value.startswith("https://"):
            parsed = urlparse(value)
            if parsed.username or parsed.password:
                raise ValueError("repo_url must not include embedded credentials")
            host = (parsed.hostname or "").lower()
            if host not in _ALLOWED_GIT_HOSTS:
                raise ValueError("repo_url must be a github.com, gitlab.com, or bitbucket.org HTTPS URL")
            parts = [p for p in parsed.path.split("/") if p]
            if len(parts) < 2 or any(p in {".", ".."} for p in parts):
                raise ValueError("repo_url must be in the form https://host/owner/repo")
            clean_path = "/" + "/".join(parts)
            return f"https://{host}{clean_path}"
        if value.startswith("http://"):
            raise ValueError("repo_url must use https://")
        if ":" in value or not _SHORTHAND_RE.fullmatch(value):
            raise ValueError("repo_url must be in the form owner/repo or https://host/owner/repo")
        owner, repo = value.split("/", 1)
        if owner in {".", ".."} or repo in {".", ".."}:
            raise ValueError("repo_url must be in the form owner/repo or https://host/owner/repo")
        repo_slug = repo[:-4] if repo.endswith(".git") else repo
        return f"https://github.com/{owner}/{repo_slug}.git"

    @field_validator("branch")
    @classmethod
    def validate_branch(cls, value: str) -> str:
        branch = (value or "").strip()
        if not branch or not _BRANCH_RE.fullmatch(branch) or ".." in branch or branch.endswith(".lock"):
            raise ValueError("Invalid git branch name")
        return branch


class ImportRepoResponse(BaseModel):
    project: Project
    files_indexed: int


def _clone_repo_sync(repo_url: str, target_dir: str, branch: str, github_token: Optional[str]) -> None:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    askpass_path: Optional[str] = None
    try:
        if github_token:
            fd, askpass_path = tempfile.mkstemp(prefix="forge-askpass-", suffix=".sh")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write("#!/bin/sh\necho \"$GITHUB_TOKEN\"\n")
            os.chmod(askpass_path, 0o700)
            env["GIT_ASKPASS"] = askpass_path
            env["GITHUB_TOKEN"] = github_token

        Repo.clone_from(repo_url, target_dir, branch=branch, env=env, depth=1)
    finally:
        if askpass_path and os.path.exists(askpass_path):
            try:
                os.unlink(askpass_path)
            except OSError:
                pass


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
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return ImportRepoResponse(project=project, files_indexed=files_indexed)
