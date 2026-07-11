from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from core.llm.router import get_llm_router
from core.ai_usage import get_spending_dashboard
from core.models import User
from api.admin import admin_required
from gateway import GatewayRequest, get_ai_gateway

router = APIRouter(prefix="/api/llm", tags=["llm"])


class LLMTestRequest(BaseModel):
    agent: str = "developer"
    messages: List[Dict[str, Any]]
    provider_names: Optional[List[str]] = None
    model: Optional[str] = None
    max_tokens: int = 8192


class AgentOverrideRequest(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    approved_providers: Optional[List[str]] = None
    approved_models: Optional[List[str]] = None
    max_tokens_per_request: Optional[int] = None
    max_cost_per_request_usd: Optional[float] = None


@router.get("/providers")
async def list_providers(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    router_instance = get_llm_router()
    return {"providers": router_instance.registry.list_providers()}


@router.get("/models")
async def list_models(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    router_instance = get_llm_router()
    return {"models": router_instance.registry.list_models()}


@router.get("/usage")
async def usage(days: int = 30, limit: int = 100, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    return {"usage": await get_spending_dashboard(days=days, limit=limit)}


@router.get("/health")
async def health(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    router_instance = get_llm_router()
    providers = await router_instance.health_check_all()
    status = "ok" if all(p["healthy"] for p in providers) else "degraded"
    return {"status": status, "providers": providers}


@router.post("/test")
async def test_provider(request: LLMTestRequest, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    gateway = get_ai_gateway()
    response = await gateway.generate(
        GatewayRequest(
            agent_name=request.agent,
            messages=request.messages,
            provider_names=request.provider_names,
            model=request.model,
            max_tokens=request.max_tokens,
        )
    )
    return {"text": response.content, "provider": response.provider, "model": response.model, "usage": response.usage}


@router.put("/agent/{agent}")
async def set_agent_override(agent: str, payload: AgentOverrideRequest, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    router_instance = get_llm_router()
    policy_fields = {"approved_providers", "approved_models", "max_tokens_per_request", "max_cost_per_request_usd"}
    values = payload.model_dump()
    override = {k: v for k, v in values.items() if v is not None and k not in policy_fields}
    policy = {k: v for k, v in values.items() if v is not None and k in policy_fields}
    if policy:
        override["policy"] = policy
    updated = await router_instance.set_agent_override(agent, override, updated_by=admin.id)
    return {"agent": agent, "configured": True, "override": updated}


@router.post("/reload")
async def reload_config(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    router_instance = get_llm_router()
    await router_instance.config_loader.reload()
    return {"status": "ok"}
