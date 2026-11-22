from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from core.database import get_db
from core.llm.guardrail_policy import (
    GuardrailPolicyError,
    org_byok_consent_complete,
    parse_guardrail_policy,
    validate_guardrail_policy,
)
from core.llm.router import get_llm_router
from core.models import Role, User
from core.permissions import require_org_role
from api.auth import get_current_user

router = APIRouter(prefix="/api/orgs", tags=["llm-policy"])

_ANY_ROLE = tuple(Role)


class OrgPolicyRequest(BaseModel):
    approved_providers: Optional[List[str]] = None
    approved_models: Optional[List[str]] = None
    max_tokens_per_request: Optional[int] = None
    max_cost_per_request_usd: Optional[float] = None
    requests_per_minute: Optional[int] = None
    # Guardrail v2 policy block (core/llm/guardrail_policy.py). Validated on
    # save (GR-9): requiring an LLM screen for BYOK builds needs every BYOK
    # member's platform_model_processing consent.
    guardrail: Optional[Dict[str, Any]] = None


async def _validated_guardrail_block(db, org_id: str, block: Dict[str, Any]) -> Dict[str, Any]:
    try:
        # Shape and values first (no I/O); consent only matters when the
        # block would require screening BYOK content.
        normalized = validate_guardrail_policy(block, byok_consent=True)
        effective = parse_guardrail_policy({"guardrail": normalized})
        if "required" in (effective.byok_llm_screen, effective.byok_input_classifier):
            consent = await org_byok_consent_complete(db, org_id)
            normalized = validate_guardrail_policy(block, byok_consent=consent)
        return normalized
    except GuardrailPolicyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{org_id}/llm-policy")
async def get_org_llm_policy(org_id: str, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    db = await get_db()
    await require_org_role(db, user_id=user.id, org_id=org_id, allowed_roles=_ANY_ROLE)
    router_instance = get_llm_router()
    policy = router_instance.config_loader.get_org_policy(org_id)
    return {"org_id": org_id, "policy": policy}


@router.put("/{org_id}/llm-policy")
async def set_org_llm_policy(org_id: str, payload: OrgPolicyRequest, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    db = await get_db()
    await require_org_role(db, user_id=user.id, org_id=org_id, allowed_roles=(Role.OWNER, Role.ADMIN))
    policy = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "guardrail" in policy:
        policy["guardrail"] = await _validated_guardrail_block(db, org_id, policy["guardrail"])
    router_instance = get_llm_router()
    updated = await router_instance.config_loader.set_org_policy_override(org_id, policy, updated_by=user.id)
    return {"org_id": org_id, "configured": True, "policy": updated}
