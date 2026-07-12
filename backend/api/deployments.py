from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from datetime import datetime
import asyncio
import logging
import os
import tempfile
import shutil
import hashlib

import docker
from git import Repo, Actor

from api.auth import get_current_user
from core.config import get_settings
from core.database import get_db, paginated_query
from core.encryption import decrypt_field
from core.models import (
    Deployment,
    DeploymentStatus,
    PaginationParams,
    WSEvent,
    WSEventType,
    User,
)
from core.security import safe_join_path
from services.ws_manager import manager

router = APIRouter(prefix="/deployments", tags=["deployments"])
settings = get_settings()
logger = logging.getLogger(__name__)
# Keep union syntax compatible with older Python versions in CI.
_docker_client = None  # type: docker.DockerClient | None


def _require_deployments_enabled():
    """Guard the Docker-backed deployment feature.

    The deployment stack requires access to the host Docker daemon socket,
    which gives the backend container root-equivalent privileges on the host.
    To prevent accidental privilege escalation, this feature is opt-in only:
    set DEPLOYMENTS_ENABLED=true in the environment to activate it.

    In production, the Docker socket is deliberately NOT mounted (see
    DEPLOYMENT.md). Without the socket, docker.from_env() would fail anyway,
    but this guard makes the failure explicit and prevents the code path from
    being reached even if the socket is accidentally mounted.
    """
    if not os.environ.get("DEPLOYMENTS_ENABLED"):
        raise HTTPException(
            status_code=503,
            detail="Deployments are not enabled on this instance. "
                  "Contact the administrator or set DEPLOYMENTS_ENABLED=true.",
        )



def get_docker_client() -> docker.DockerClient:
    global _docker_client
    if _docker_client is None:
        _docker_client = docker.from_env()
    return _docker_client


class CreateDeploymentRequest(BaseModel):
    build_id: str
    project_id: str


class CreateDeploymentResponse(BaseModel):
    deployment_id: str
    status: str
    url: Optional[str] = None
    message: str = ""


class EnvVarUpdateRequest(BaseModel):
    env_vars: Dict[str, str]


class DomainUpdateRequest(BaseModel):
    domain: str


class GitHubPushRequest(BaseModel):
    project_id: str
    build_id: str
    repo_url: str
    branch: str = "main"
    commit_message: str = "feat: deploy via Forge"
    github_token: str


class DeploymentListResponse(BaseModel):
    deployments: List[Dict[str, Any]]
    total: int
    page: int
    per_page: int
    total_pages: int


class DeploymentDetailResponse(BaseModel):
    deployment: Dict[str, Any]


class DeploymentUrlResponse(BaseModel):
    url: str


class GenericResponse(BaseModel):
    ok: bool
    message: str = ""


class DeploymentLogsResponse(BaseModel):
    logs: str


@router.post("/", response_model=CreateDeploymentResponse)
async def create_deployment(
    req: CreateDeploymentRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    _require_deployments_enabled()
    db = await get_db()

    build = await db.builds.find_one(
        {"id": req.build_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    project = await db.projects.find_one(
        {"id": req.project_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    deployment = Deployment(
        project_id=req.project_id,
        user_id=current_user.id,
        build_id=req.build_id,
        status=DeploymentStatus.PENDING,
        provider="docker",
        env_vars={},
        logs="",
    )
    await db.deployments.insert_one(deployment.model_dump())

    event = WSEvent(
        type=WSEventType.BUILD_START,
        build_id=req.build_id,
        data={"deployment_id": deployment.id, "status": DeploymentStatus.PENDING},
    )
    await manager.emit(event)

    background_tasks.add_task(
        _run_deployment_background,
        deployment,
        build,
        project,
    )

    return CreateDeploymentResponse(
        deployment_id=deployment.id,
        status=deployment.status,
        message="Deployment queued",
    )


@router.get("/", response_model=DeploymentListResponse)
async def list_deployments(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()
    query: Dict[str, Any] = {"user_id": current_user.id}
    if project_id:
        query["project_id"] = project_id

    result = await paginated_query(
        db.deployments,
        query,
        page=params.page,
        per_page=params.per_page,
        sort=[("created_at", -1)],
        projection={"_id": 0, "env_vars": 0},
    )
    return DeploymentListResponse(
        deployments=result.items,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


@router.get("/{deployment_id}", response_model=DeploymentDetailResponse)
async def get_deployment(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    deployment = await db.deployments.find_one(
        {"id": deployment_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return DeploymentDetailResponse(deployment=deployment)


@router.post("/{deployment_id}/redeploy", response_model=GenericResponse)
async def redeploy(
    deployment_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    _require_deployments_enabled()
    db = await get_db()
    deployment = await db.deployments.find_one(
        {"id": deployment_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    if deployment["status"] in (
        DeploymentStatus.BUILDING,
        DeploymentStatus.DEPLOYING,
    ):
        raise HTTPException(
            status_code=400,
            detail="Deployment already in progress",
        )

    build_id = deployment.get("build_id")
    if not build_id:
        raise HTTPException(status_code=400, detail="No associated build found")

    build = await db.builds.find_one(
        {"id": build_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    project_id = deployment["project_id"]
    project = await db.projects.find_one(
        {"id": project_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    dep_obj = Deployment(**deployment)
    dep_obj.status = DeploymentStatus.PENDING
    dep_obj.logs = ""
    dep_obj.url = None
    dep_obj.deployed_at = None
    await db.deployments.update_one(
        {"id": deployment_id}, {"$set": dep_obj.model_dump()}
    )

    event = WSEvent(
        type=WSEventType.BUILD_START,
        build_id=build_id,
        data={"deployment_id": deployment_id, "status": DeploymentStatus.PENDING},
    )
    await manager.emit(event)

    background_tasks.add_task(
        _run_deployment_background,
        dep_obj,
        build,
        project,
    )

    return GenericResponse(
        ok=True,
        message="Redeployment queued",
    )


@router.delete("/{deployment_id}", response_model=GenericResponse)
async def cancel_deployment(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    deployment = await db.deployments.find_one(
        {"id": deployment_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    status = deployment.get("status")
    if status in (
        DeploymentStatus.LIVE,
        DeploymentStatus.CANCELLED,
    ):
        if status == DeploymentStatus.LIVE:
            await db.deployments.update_one(
                {"id": deployment_id},
                {"$set": {"status": DeploymentStatus.CANCELLED}},
            )
        return GenericResponse(ok=True, message="Deployment already terminal")

    await db.deployments.update_one(
        {"id": deployment_id},
        {
            "$set": {
                "status": DeploymentStatus.CANCELLED,
                "logs": deployment.get("logs", "") + "\nCancelled by user",
            }
        },
    )

    if status in (DeploymentStatus.BUILDING, DeploymentStatus.DEPLOYING):
        _require_deployments_enabled()
        container_name = f"forge-deploy-{deployment_id}"
        try:
            client = get_docker_client()
            containers = client.containers.list(filters={"name": container_name})
            for c in containers:
                c.kill()
                c.remove()
        except Exception:
            pass

    return GenericResponse(
        ok=True,
        message="Deployment cancelled",
    )


@router.post("/{deployment_id}/env-vars", response_model=GenericResponse)
async def update_env_vars(
    deployment_id: str,
    req: EnvVarUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    deployment = await db.deployments.find_one(
        {"id": deployment_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    await db.deployments.update_one(
        {"id": deployment_id},
        {"$set": {"env_vars": req.env_vars}},
    )
    return GenericResponse(ok=True, message="Environment variables updated")


@router.get("/{deployment_id}/logs", response_model=DeploymentLogsResponse)
async def get_deployment_logs(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    deployment = await db.deployments.find_one(
        {"id": deployment_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return DeploymentLogsResponse(logs=deployment.get("logs", ""))


@router.post("/{deployment_id}/domain", response_model=GenericResponse)
async def update_domain(
    deployment_id: str,
    req: DomainUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    deployment = await db.deployments.find_one(
        {"id": deployment_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    await db.deployments.update_one(
        {"id": deployment_id},
        {"$set": {"url": f"https://{req.domain}"}},
    )
    return GenericResponse(ok=True, message="Domain updated")


@router.get("/{deployment_id}/url", response_model=DeploymentUrlResponse)
async def get_deployment_url(
    deployment_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    deployment = await db.deployments.find_one(
        {"id": deployment_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    url = deployment.get("url")
    if not url:
        port = 8000 + (
            int(hashlib.sha256(deployment_id.encode()).hexdigest(), 16) % 1000
        )
        url = f"http://{settings.deployment_host}:{port}"

    return DeploymentUrlResponse(url=url)


@router.post("/github/push", response_model=GenericResponse)
async def push_to_github(
    req: GitHubPushRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    project = await db.projects.find_one(
        {"id": req.project_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    build = await db.builds.find_one(
        {"id": req.build_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    # Get GitHub token - prefer user's stored encrypted token
    github_token = req.github_token
    if not github_token and current_user.github_token:
        # Decrypt the stored token
        github_token = decrypt_field(current_user.github_token)
    
    if not github_token:
        raise HTTPException(
            status_code=400,
            detail="GitHub token required. Connect your GitHub account or provide a token.",
        )

    background_tasks.add_task(
        _github_push_background,
        req,
        build,
        project,
        github_token,
    )

    return GenericResponse(ok=True, message="GitHub push queued")


async def _run_deployment_background(
    deployment: Deployment,
    build: Dict[str, Any],
    project: Dict[str, Any],
    db=None,
):
    if db is None:
        db = await get_db()

    def emit(event):
        asyncio.run(manager.emit(event))

    try:
        await db.deployments.update_one(
            {"id": deployment.id},
            {
                "$set": {
                    "status": DeploymentStatus.BUILDING,
                    "logs": "Starting build process...",
                }
            },
        )
        await manager.emit(
            WSEvent(
                type=WSEventType.BUILD_START,
                build_id=build.get("id", ""),
                data={
                    "deployment_id": deployment.id,
                    "status": DeploymentStatus.BUILDING,
                },
            )
        )

        files = build.get("files", {})
        temp_dir = tempfile.mkdtemp(prefix=f"forge-deploy-{deployment.id}-")
        try:
            dockerfile_content = _infer_dockerfile(
                temp_dir, project.get("tech_stack", {})
            )

            def _write_deploy_files_sync():
                for path, content in files.items():
                    # Build-file paths are attacker/AI-influenced: reject traversal
                    # and absolute paths so a malicious "file" can't escape the
                    # sandbox dir (P0-HIGH-005 path traversal / arbitrary file write).
                    file_path = safe_join_path(temp_dir, path)
                    if file_path is None:
                        logger.warning("Skipping unsafe deployment file path: %r", path)
                        continue
                    os.makedirs(os.path.dirname(file_path), exist_ok=True)
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(content)

                with open(os.path.join(temp_dir, "Dockerfile"), "w", encoding="utf-8") as f:
                    f.write(dockerfile_content)

            # Writing potentially many/large generated files is real I/O work;
            # keep it off the event loop so it doesn't stall other requests
            # being served by this worker.
            await asyncio.to_thread(_write_deploy_files_sync)

            await db.deployments.update_one(
                {"id": deployment.id},
                {
                    "$set": {
                        "status": DeploymentStatus.DEPLOYING,
                        "logs": "Building Docker image...",
                    }
                },
            )
            await manager.emit(
                WSEvent(
                    type=WSEventType.AGENT_PROGRESS,
                    build_id=build.get("id", ""),
                    data={
                        "deployment_id": deployment.id,
                        "status": DeploymentStatus.DEPLOYING,
                    },
                )
            )

            def build_and_run():
                client = get_docker_client()
                image_tag = f"forge-deploy-{deployment.id}:latest"

                build_logs = []
                for line in client.api.build(
                    path=temp_dir,
                    tag=image_tag,
                    rm=True,
                    forcerm=True,
                ):
                    if "stream" in line:
                        build_logs.append(line["stream"].strip())

                image = client.images.get(image_tag)

                port = 8000 + (
                    int(hashlib.sha256(deployment.id.encode()).hexdigest(), 16) % 1000
                )
                env_vars = deployment.env_vars or {}
                env_vars.setdefault("PORT", str(port))
                # Binds inside the deployed container, not this host — Docker's port
                # mapping (ports={"8000/tcp": port} below) is what actually exposes it,
                # and 127.0.0.1 here would make the app unreachable through that mapping.
                env_vars.setdefault("HOST", "0.0.0.0")  # nosec B104

                client.containers.run(
                    image=image,
                    name=f"forge-deploy-{deployment.id}",
                    ports={"8000/tcp": port},
                    environment=env_vars,
                    detach=True,
                    remove=False,
                )

                return port, "\n".join(build_logs)

            port, build_logs = await asyncio.to_thread(build_and_run)
            container_url = f"http://{settings.deployment_host}:{port}"

            await db.deployments.update_one(
                {"id": deployment.id},
                {
                    "$set": {
                        "status": DeploymentStatus.LIVE,
                        "url": container_url,
                        "logs": f"{deployment.logs}\nBuild complete.\n{build_logs}",
                        "deployed_at": datetime.utcnow().isoformat(),
                    }
                },
            )
            await manager.emit(
                WSEvent(
                    type=WSEventType.BUILD_COMPLETE,
                    build_id=build.get("id", ""),
                    data={
                        "deployment_id": deployment.id,
                        "status": DeploymentStatus.LIVE,
                        "url": container_url,
                    },
                )
            )

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

        await db.projects.update_one(
            {"id": deployment.project_id},
            {
                "$set": {
                    "deployed_url": container_url,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            },
        )

    except docker.errors.BuildError as e:
        error_msg = f"Docker build failed: {e}"
        await db.deployments.update_one(
            {"id": deployment.id},
            {
                "$set": {
                    "status": DeploymentStatus.FAILED,
                    "logs": f"{deployment.logs}\n{error_msg}",
                }
            },
        )
        await manager.emit(
            WSEvent(
                type=WSEventType.BUILD_FAILED,
                build_id=build.get("id", ""),
                data={"deployment_id": deployment.id, "error": error_msg},
            )
        )
    except Exception as e:
        error_msg = f"Deployment failed: {str(e)}"
        await db.deployments.update_one(
            {"id": deployment.id},
            {
                "$set": {
                    "status": DeploymentStatus.FAILED,
                    "logs": f"{deployment.logs}\n{error_msg}",
                }
            },
        )
        await manager.emit(
            WSEvent(
                type=WSEventType.BUILD_FAILED,
                build_id=build.get("id", ""),
                data={"deployment_id": deployment.id, "error": error_msg},
            )
        )


async def _github_push_background(
    req: GitHubPushRequest,
    build: Dict[str, Any],
    project: Dict[str, Any],
    github_token: str,
    db=None,
):
    if db is None:
        db = await get_db()

    try:
        temp_dir = tempfile.mkdtemp(prefix="forge-github-push-")
        try:
            # Use GIT_ASKPASS to pass token securely instead of embedding in URL
            askpass_script = os.path.join(temp_dir, ".git-askpass.sh")

            def _write_askpass_sync():
                with open(askpass_script, "w") as f:
                    f.write("#!/bin/sh\necho \"$GITHUB_TOKEN\"\n")
                os.chmod(askpass_script, 0o700)

            await asyncio.to_thread(_write_askpass_sync)

            env = os.environ.copy()
            env["GIT_ASKPASS"] = askpass_script
            env["GITHUB_TOKEN"] = github_token

            repo = await asyncio.to_thread(
                Repo.clone_from,
                req.repo_url,
                temp_dir,
                env=env,
            )

            files = build.get("files", {})

            def _write_repo_files_sync():
                for path, content in files.items():
                    # Same traversal guard as the docker deploy path: a malicious
                    # file path must not escape the cloned repo dir.
                    file_path = safe_join_path(temp_dir, path)
                    if file_path is None:
                        logger.warning("Skipping unsafe github-push file path: %r", path)
                        continue
                    os.makedirs(os.path.dirname(file_path), exist_ok=True)
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(content)

            await asyncio.to_thread(_write_repo_files_sync)

            index = repo.index
            index.add(["."])
            if index.diff("HEAD"):
                index.commit(
                    req.commit_message,
                    author=Actor("Forge", "noreply@forge.ai"),
                    committer=Actor("Forge", "noreply@forge.ai"),
                )
                origin = repo.remote(name="origin")
                await asyncio.to_thread(origin.push, req.branch)

            await manager.emit(
                WSEvent(
                    type=WSEventType.BUILD_COMPLETE,
                    build_id=req.build_id,
                    data={
                        "status": "pushed",
                        "repo": req.repo_url,
                        "branch": req.branch,
                    },
                )
            )
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception as e:
        await manager.emit(
            WSEvent(
                type=WSEventType.BUILD_FAILED,
                build_id=req.build_id,
                data={"error": f"GitHub push failed: {str(e)}"},
            )
        )


def _infer_dockerfile(project_dir: str, tech_stack: Dict[str, Any]) -> str:
    tech = {k.lower(): v.lower() for k, v in tech_stack.items()}
    has_node = (
        "node" in tech
        or "javascript" in tech
        or "typescript" in tech
        or "react" in tech
        or "nextjs" in tech
    )
    has_python = (
        "python" in tech or "fastapi" in tech or "flask" in tech or "django" in tech
    )
    has_next = "nextjs" in tech or "next.js" in tech

    if has_next:
        return (
            "FROM node:20-alpine\n"
            "WORKDIR /app\n"
            "COPY package*.json ./\n"
            "RUN npm ci --only=production\n"
            "COPY . .\n"
            "RUN npm run build\n"
            "ENV NODE_ENV=production\n"
            "EXPOSE 8000\n"
            'CMD ["npm", "start"]\n'
        )

    if has_node and not has_python:
        return (
            "FROM node:20-alpine\n"
            "WORKDIR /app\n"
            "COPY package*.json ./\n"
            "RUN npm ci --only=production\n"
            "COPY . .\n"
            "ENV PORT=8000\n"
            "ENV NODE_ENV=production\n"
            "EXPOSE 8000\n"
            'CMD ["node", "index.js"]\n'
        )

    if has_python:
        return (
            "FROM python:3.11-slim\n"
            "WORKDIR /app\n"
            "COPY requirements.txt ./\n"
            "RUN pip install --no-cache-dir -r requirements.txt\n"
            "COPY . .\n"
            "ENV PORT=8000\n"
            "ENV PYTHONUNBUFFERED=1\n"
            "EXPOSE 8000\n"
            'CMD ["python", "main.py"]\n'
        )

    return (
        "FROM python:3.11-slim\n"
        "WORKDIR /app\n"
        "COPY requirements.txt ./\n"
        "RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi\n"
        "COPY . .\n"
        "ENV PORT=8000\n"
        "ENV PYTHONUNBUFFERED=1\n"
        "EXPOSE 8000\n"
        'CMD ["python", "-m", "http.server", "8000"]\n'
    )
