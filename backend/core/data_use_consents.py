"""`data_use_consents`: explicit, versioned opt-ins that widen what Forge may
do with a user's content (docs/architecture/agent-collaboration-plan.md
§5.4, §15.2).

A2 owns two scopes:

- ``platform_model_processing``: Forge-credential guardrail, classifier and
  retrieval calls over this user's BYOK content.
- ``byok_auto_retry``: up to N automatic repairs or retries on the
  customer's own key (X4). N is chosen by the user and capped by
  ``settings.byok_auto_retry_max_cap``.

``ai_quality_review`` and ``human_quality_review`` belong to S0; the store
accepts them so S0 does not need a schema change, but nothing in A2 reads
them.

One document per (user, scope), keyed by a deterministic ``_id`` so a grant
or revoke is a single-document guarded update (G5, §10.3) and concurrent
grants can never create duplicates. Consent records are never deleted by a
revoke: ``revoked_at`` is set and the history is kept (§18.2: "consent
records" must survive a rollback).

A consent only counts while it is active *and* was captured against the
current ``settings.processing_policy_version``; a material change to the
policy text therefore requires re-consent.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from core.config import get_settings
from core.models import utcnow

logger = logging.getLogger(__name__)

COLLECTION = "data_use_consents"

SCOPE_PLATFORM_MODEL_PROCESSING = "platform_model_processing"
SCOPE_BYOK_AUTO_RETRY = "byok_auto_retry"
SCOPE_AI_QUALITY_REVIEW = "ai_quality_review"
SCOPE_HUMAN_QUALITY_REVIEW = "human_quality_review"

A2_SCOPES = frozenset({SCOPE_PLATFORM_MODEL_PROCESSING, SCOPE_BYOK_AUTO_RETRY})
KNOWN_SCOPES = A2_SCOPES | {SCOPE_AI_QUALITY_REVIEW, SCOPE_HUMAN_QUALITY_REVIEW}


class ConsentError(ValueError):
    """Invalid consent request (unknown scope, bad N, missing user)."""


@dataclass(frozen=True)
class ActiveConsents:
    """The consents that currently count for one user."""

    scopes: frozenset
    byok_auto_retry_max: int = 0

    @classmethod
    def none(cls) -> "ActiveConsents":
        return cls(scopes=frozenset(), byok_auto_retry_max=0)


def _consent_id(user_id: str, scope: str) -> str:
    return f"{user_id}:{scope}"


def _validate_scope(scope: str) -> str:
    if scope not in KNOWN_SCOPES:
        raise ConsentError(f"unknown consent scope: {scope!r}")
    return scope


def _validate_max_retries(scope: str, max_retries: Optional[int]) -> Optional[int]:
    if scope != SCOPE_BYOK_AUTO_RETRY:
        return None
    cap = int(get_settings().byok_auto_retry_max_cap)
    if max_retries is None or not isinstance(max_retries, int) or isinstance(max_retries, bool):
        raise ConsentError("byok_auto_retry requires an integer max_retries")
    if max_retries < 1 or max_retries > cap:
        raise ConsentError(f"byok_auto_retry max_retries must be between 1 and {cap}")
    return max_retries


async def grant_consent(
    db,
    *,
    user_id: str,
    scope: str,
    max_retries: Optional[int] = None,
    granted_by: Optional[str] = None,
    policy_version: Optional[str] = None,
) -> Dict[str, Any]:
    """Grant (or re-grant) ``scope`` for ``user_id``. Takes effect only for
    builds admitted afterwards: running builds keep the boundary they were
    snapshotted with (BY-7)."""
    if not user_id:
        raise ConsentError("user_id is required")
    _validate_scope(scope)
    n = _validate_max_retries(scope, max_retries)
    now = utcnow()
    doc = {
        "user_id": user_id,
        "scope": scope,
        "max_retries": n,
        "policy_version": policy_version or get_settings().processing_policy_version,
        "granted_at": now,
        "granted_by": granted_by or user_id,
        "revoked_at": None,
        "updated_at": now,
    }
    await db[COLLECTION].update_one(
        {"_id": _consent_id(user_id, scope)},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return doc


async def revoke_consent(db, *, user_id: str, scope: str, revoked_by: Optional[str] = None) -> bool:
    """Revoke immediately. Running builds narrow at their next operation
    (see ``core.processing_boundary.refresh_boundary``)."""
    _validate_scope(scope)
    now = utcnow()
    result = await db[COLLECTION].update_one(
        {"_id": _consent_id(user_id, scope), "revoked_at": None},
        {"$set": {"revoked_at": now, "revoked_by": revoked_by or user_id, "updated_at": now}},
    )
    return bool(getattr(result, "modified_count", 0))


async def list_consents(db, user_id: str) -> List[Dict[str, Any]]:
    docs: List[Dict[str, Any]] = []
    async for doc in db[COLLECTION].find({"user_id": user_id}):
        doc = dict(doc)
        doc.pop("_id", None)
        docs.append(doc)
    return docs


def active_from_docs(docs: List[Dict[str, Any]], *, policy_version: Optional[str] = None) -> ActiveConsents:
    version = policy_version or get_settings().processing_policy_version
    scopes = set()
    retry_max = 0
    for doc in docs:
        if doc.get("revoked_at") is not None:
            continue
        if doc.get("policy_version") != version:
            continue
        scope = doc.get("scope")
        if scope not in KNOWN_SCOPES:
            continue
        if scope == SCOPE_BYOK_AUTO_RETRY:
            try:
                n = int(doc.get("max_retries") or 0)
            except (TypeError, ValueError):
                n = 0
            n = max(0, min(n, int(get_settings().byok_auto_retry_max_cap)))
            if n <= 0:
                continue
            retry_max = n
        scopes.add(scope)
    return ActiveConsents(scopes=frozenset(scopes), byok_auto_retry_max=retry_max)


async def get_active_consents(db, user_id: Optional[str]) -> ActiveConsents:
    """Active consents for ``user_id``. Raises on a DB error: callers decide
    what failing closed means for them (snapshot: no consents)."""
    if not user_id:
        return ActiveConsents.none()
    docs = await list_consents(db, user_id)
    return active_from_docs(docs)
