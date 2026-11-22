"""Data-use consents API (docs/architecture/agent-collaboration-plan.md §5.4).

A user grants or revokes, for their own account:

- ``platform_model_processing``: Forge-credential guardrail, classifier and
  retrieval calls over their BYOK content;
- ``byok_auto_retry`` with ``max_retries`` = N: up to N automatic repairs or
  retries on their own provider key.

A grant applies only to builds admitted afterwards; a revocation takes
effect immediately and narrows running builds at their next operation.
The S0 scopes (``ai_quality_review``, ``human_quality_review``) are not
offered until S0 ships. Shipping the opt-in screen copy (U9) is B1's.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user
from core.config import get_settings
from core.data_use_consents import (
    A2_SCOPES,
    ConsentError,
    active_from_docs,
    grant_consent,
    list_consents,
    revoke_consent,
)
from core.database import get_db
from core.models import User

router = APIRouter(prefix="/api/consents", tags=["consents"])


class GrantConsentRequest(BaseModel):
    max_retries: Optional[int] = None
    # The policy text version the user was shown; must match the current
    # one so a consent is never recorded against text the user did not see.
    policy_version: Optional[str] = None


def _require_a2_scope(scope: str) -> None:
    if scope not in A2_SCOPES:
        raise HTTPException(status_code=404, detail="Unknown consent scope")


@router.get("")
async def get_my_consents(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    db = await get_db()
    docs = await list_consents(db, user.id)
    active = active_from_docs(docs)
    return {
        "policy_version": get_settings().processing_policy_version,
        "active": sorted(active.scopes),
        "byok_auto_retry_max": active.byok_auto_retry_max,
        "consents": docs,
    }


@router.put("/{scope}")
async def grant_my_consent(
    scope: str, payload: GrantConsentRequest, user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    _require_a2_scope(scope)
    current_version = get_settings().processing_policy_version
    if payload.policy_version is not None and payload.policy_version != current_version:
        raise HTTPException(status_code=409, detail="Consent text has changed; please review it again")
    db = await get_db()
    try:
        doc = await grant_consent(
            db, user_id=user.id, scope=scope, max_retries=payload.max_retries, granted_by=user.id,
        )
    except ConsentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"scope": scope, "granted": True, "max_retries": doc.get("max_retries"),
            "policy_version": doc.get("policy_version")}


@router.delete("/{scope}")
async def revoke_my_consent(scope: str, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _require_a2_scope(scope)
    db = await get_db()
    revoked = await revoke_consent(db, user_id=user.id, scope=scope, revoked_by=user.id)
    return {"scope": scope, "revoked": revoked}
