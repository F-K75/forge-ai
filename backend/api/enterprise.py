"""Enterprise OS API Surface for Milestones #2 & #3.

Exposes authenticated, strictly project-scoped endpoints under
`/v1/projects/{project_id}/os/*`:
- Cross-Run Knowledge & Episodic Memory Fabric (`/memory`, `/memory/query`)
- Multi-Agent Benchmark Harness & Regression Gate (`/benchmarks`, `/benchmarks/run`)
- OpenTelemetry-Compatible W3C Run Traces & OTLP Export (`/traces`, `/traces/{run_id}`)
- Governed Agent & Skill Marketplace (`/marketplace`, `/marketplace/install`, `/marketplace/publish`)
- Enterprise Multi-Tenant Governance Policy Engine (`/policy`)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.auth import get_current_user
from core.benchmark_harness import get_benchmark_harness
from core.database import get_db
from core.kernel_observability import get_trace_collector
from core.knowledge_fabric import get_knowledge_fabric
from core.models import User
from core.permissions import has_project_access
from core.skill_marketplace import get_governance_policy_store, get_skill_marketplace

router = APIRouter(prefix="/projects/{project_id}/os", tags=["enterprise-os"])


async def _assert_project_access(db, project_id: str, user_id: str) -> Dict[str, Any]:
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _attach_memory_persister(db) -> None:
    fabric = get_knowledge_fabric()
    if fabric._persister is None:
        async def _persist_node(project_id: str, doc: Dict[str, Any]) -> None:
            await db.knowledge_fabric_nodes.update_one(
                {"project_id": project_id, "node_id": doc.get("node_id")},
                {"$set": dict(doc)},
                upsert=True,
            )

        fabric.attach_persister(_persist_node)


class MemoryQueryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    top_k: int = Field(5, ge=1, le=20)
    max_chars: int = Field(2400, ge=200, le=8000)


class InstallMarketplacePackageRequest(BaseModel):
    package_id: str = Field(..., min_length=3, max_length=80)


class PublishMarketplacePackageRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=64)
    title: str = Field(..., min_length=3, max_length=120)
    domain: str = Field(..., min_length=2, max_length=64)
    version: str = Field("1.0.0", min_length=5, max_length=24)
    description: str = Field(..., min_length=8, max_length=400)
    keywords: List[str] = Field(default_factory=list, max_length=12)
    required_permissions: List[str] = Field(default_factory=lambda: ["read_repo"], max_length=8)
    allowed_departments: List[str] = Field(default_factory=list, max_length=9)
    instructions: str = Field(..., min_length=8, max_length=2000)


class UpdateGovernancePolicyRequest(BaseModel):
    max_run_budget_usd: Optional[float] = Field(None, ge=0.05, le=100.0)
    require_approval_for_delivery: Optional[bool] = None
    allow_external_mcp_servers: Optional[bool] = None
    allow_local_llm_routing: Optional[bool] = None
    allowed_mcp_domains: Optional[List[str]] = Field(None, max_length=20)
    blocked_skill_permissions: Optional[List[str]] = Field(None, max_length=20)


# --- Milestone #2: Cross-Run Knowledge Fabric & Multi-Agent Benchmarks ---


@router.get("/memory")
async def get_project_memory_snapshot(
    project_id: str,
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _attach_memory_persister(db)
    return get_knowledge_fabric().get_project_snapshot(project_id, limit=limit)


@router.post("/memory/query")
async def query_project_memory(
    project_id: str,
    req: MemoryQueryRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    hits = get_knowledge_fabric().retrieve_context(
        project_id=project_id,
        query=req.query,
        top_k=req.top_k,
        max_chars=req.max_chars,
    )
    return {
        "project_id": project_id,
        "query": req.query,
        "hits": [h.to_dict() for h in hits],
    }


@router.post("/benchmarks/run")
async def run_project_benchmarks(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    report = await get_benchmark_harness().run_suite(project_id=project_id)
    return report.to_dict()


@router.get("/benchmarks")
async def list_project_benchmarks(
    project_id: str,
    limit: int = Query(10, ge=1, le=25),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return {
        "project_id": project_id,
        "reports": get_benchmark_harness().get_history(project_id, limit=limit),
    }


# --- Milestone #3: OpenTelemetry Traces, Skill Marketplace & Governance Policy ---


@router.get("/traces")
async def list_project_traces(
    project_id: str,
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return {
        "project_id": project_id,
        "traces": get_trace_collector().list_traces_for_project(project_id, limit=limit),
    }


@router.get("/traces/{run_id}")
async def get_run_trace(
    project_id: str,
    run_id: str,
    export_format: str = Query("summary", alias="format", pattern="^(summary|otlp)$"),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    trace = get_trace_collector().get_trace(project_id, run_id)
    if trace is None:
        raise HTTPException(status_code=404, detail="Run trace not found")
    return trace.to_otlp_json() if export_format == "otlp" else trace.summary()


@router.get("/marketplace")
async def list_marketplace_skills(
    project_id: str,
    domain: Optional[str] = Query(None, max_length=64),
    search: Optional[str] = Query(None, max_length=128),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return {
        "project_id": project_id,
        "packages": get_skill_marketplace().list_packages(
            project_id=project_id, domain=domain, search=search
        ),
    }


@router.post("/marketplace/install")
async def install_marketplace_skill(
    project_id: str,
    req: InstallMarketplacePackageRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    try:
        return get_skill_marketplace().install_package(
            project_id=project_id, package_id=req.package_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/marketplace/publish")
async def publish_marketplace_skill(
    project_id: str,
    req: PublishMarketplacePackageRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    try:
        pkg = get_skill_marketplace().publish_package(
            name=req.name,
            title=req.title,
            domain=req.domain,
            version=req.version,
            author=current_user.email or current_user.id,
            description=req.description,
            keywords=req.keywords,
            required_permissions=req.required_permissions,
            allowed_departments=req.allowed_departments,
            instructions=req.instructions,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"package": pkg.to_dict()}


@router.get("/policy")
async def get_project_governance_policy(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return get_governance_policy_store().get_policy(project_id).to_dict()


@router.put("/policy")
async def update_project_governance_policy(
    project_id: str,
    req: UpdateGovernancePolicyRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    try:
        policy = get_governance_policy_store().update_policy(
            project_id,
            max_run_budget_usd=req.max_run_budget_usd,
            require_approval_for_delivery=req.require_approval_for_delivery,
            allow_external_mcp_servers=req.allow_external_mcp_servers,
            allow_local_llm_routing=req.allow_local_llm_routing,
            allowed_mcp_domains=req.allowed_mcp_domains,
            blocked_skill_permissions=req.blocked_skill_permissions,
            updated_by=current_user.email or current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return policy.to_dict()
