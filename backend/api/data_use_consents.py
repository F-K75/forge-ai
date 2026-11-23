"""Data-use consents API (docs/architecture/agent-collaboration-plan.md §5.4).

A user grants or revokes, for their own account:

- ``platform_model_processing``: Forge-credential guardrail, classifier and
  retrieval calls over their BYOK content;
- ``byok_auto_retry`` with ``max_retries`` = N: up to N automatic repairs or
  retries on their own provider key;
- ``ai_quality_review`` (S0): shadow AI review of their builds (U8);
  revoking drops their queued reviews;
- ``human_quality_review`` (S0): human adjudication of their builds (C7,
  U12); revoking purges their adjudication excerpts. Not grantable (409)
  while external adjudication is disabled pending the privacy review.

A grant applies only to builds admitted afterwards; a revocation takes
effect immediately and narrows running builds at their next operation.
Each scope is versioned to its policy text (``policy_versions``). Shipping
the A2 opt-in screen copy (U9) is B1's.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user
from core.config import get_settings
from core.data_use_consents import (
    KNOWN_SCOPES,
    ConsentError,
    ConsentUnavailable,
    active_from_docs,
    grant_consent,
    list_consents,
    policy_version_for,
    revoke_consent,
    scope_grantable,
)
from core.database import get_db
from core.models import User

router = APIRouter(prefix="/api/consents", tags=["consents"])


class GrantConsentRequest(BaseModel):
    max_retries: Optional[int] = None
    # The policy text version the user was shown; must match the current
    # one so a consent is never recorded against text the user did not see.
    policy_version: Optional[str] = None


def _require_known_scope(scope: str) -> None:
    if scope not in KNOWN_SCOPES:
        raise HTTPException(status_code=404, detail="Unknown consent scope")


@router.get("")
async def get_my_consents(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    db = await get_db()
    docs = await list_consents(db, user.id)
    active = active_from_docs(docs)
    user_doc = await db.users.find_one({"id": user.id}, {"_id": 0, "is_internal": 1}) or {}
    settings = get_settings()
    return {
        "policy_version": settings.processing_policy_version,
        "policy_versions": {scope: policy_version_for(scope) for scope in sorted(KNOWN_SCOPES)},
        "grantable": {scope: scope_grantable(scope) for scope in sorted(KNOWN_SCOPES)},
        "active": sorted(active.scopes),
        "byok_auto_retry_max": active.byok_auto_retry_max,
        "quality_review": {
            "is_internal": user_doc.get("is_internal") is True,
            "external_adjudication_available": bool(settings.external_adjudication_opt_in),
        },
        "consents": docs,
    }


@router.put("/{scope}")
async def grant_my_consent(
    scope: str, payload: GrantConsentRequest, user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    _require_known_scope(scope)
    current_version = policy_version_for(scope)
    if payload.policy_version is not None and payload.policy_version != current_version:
        raise HTTPException(status_code=409, detail="Consent text has changed; please review it again")
    db = await get_db()
    try:
        doc = await grant_consent(
            db, user_id=user.id, scope=scope, max_retries=payload.max_retries, granted_by=user.id,
        )
    except ConsentUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ConsentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"scope": scope, "granted": True, "max_retries": doc.get("max_retries"),
            "policy_version": doc.get("policy_version")}


@router.delete("/{scope}")
async def revoke_my_consent(scope: str, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    _require_known_scope(scope)
    db = await get_db()
    revoked = await revoke_consent(db, user_id=user.id, scope=scope, revoked_by=user.id)
    return {"scope": scope, "revoked": revoked}
