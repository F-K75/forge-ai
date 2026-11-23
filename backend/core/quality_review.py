"""S0: who may have their builds reviewed, by an AI shadow reviewer or by a
human adjudicator (docs/architecture/agent-collaboration-plan.md §5.4,
§17.2, §17.3; Revision 2 amended §12.3, PV-1 and PV-2).

Three pieces live here:

- ``users.is_internal``: admin-set only (``set_user_internal``), with one
  audit-log entry per actual change. Users cannot set it: the profile
  update endpoint whitelists its fields and ``User`` does not declare it.
- ``evaluate_review_eligibility``: the single decision for both kinds of
  review. AI shadow review (U8, U2): the owner is internal or holds
  ``ai_quality_review``; a BYOK build additionally needs
  ``platform_model_processing``, checked through the A2 choke point
  (``check_platform_model_allowed`` with purpose ``shadow``) on the build's
  admission snapshot narrowed to what is active now. Human adjudication
  (C7, U12): internal by default; external only with
  ``human_quality_review`` **and** ``settings.external_adjudication_opt_in``
  (off until the privacy review completes). No platform model is involved,
  so the BYOK boundary does not apply; the redactor and the access log do.
- Consent revocation effects (``on_consent_revoked``, called by
  ``core.data_use_consents.revoke_consent``): ``human_quality_review``
  purges the owner's adjudication excerpts; ``ai_quality_review`` drops the
  owner's queued shadow reviews and calls the handlers S1 registers with
  ``register_ai_review_revocation_handler``.

Timing. A consent counts for a build only if it is active now *and* was
granted no later than the build was admitted: as for
``platform_model_processing`` (§5.4), a grant never widens builds that
already exist, and a revocation applies at once. ``is_internal`` is read at
decision time. A build without a processing-boundary snapshot (admitted
before A2) is treated as BYOK with no consents: it can still be adjudicated
by a human under the internal rule, but never AI-reviewed.

``shadow_reviews`` contract (S1 creates the documents): ``id`` (unique),
``build_id``, ``owner_user_id``, ``status`` (``queued`` / ``reserved`` /
``pending`` before the reviewer runs), ``consent_basis`` (``internal`` /
``opt_in``, from ``ReviewEligibility.ai_review.basis``). S1 must also call
``evaluate_review_eligibility`` again when a queued review is dequeued,
because a Celery message cannot be recalled, and must leave the queued
statuses with a guarded update (``{id, status: queued}`` -> ``running``) so
a concurrent drop and a starting review exclude each other. Budget hooks:
``core.shadow_budget.reserve_shadow_review`` / ``settle_shadow_review``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, FrozenSet, Iterable, List, Optional, Tuple, Union

from core.data_use_consents import (
    SCOPE_AI_QUALITY_REVIEW,
    SCOPE_HUMAN_QUALITY_REVIEW,
    SCOPE_PLATFORM_MODEL_PROCESSING,
    consent_counts,
    list_consents,
)
from core.models import utcnow
from core.processing_boundary import (
    CredentialMode,
    ProcessingBoundary,
    Purpose,
    check_platform_model_allowed,
)

logger = logging.getLogger(__name__)

SHADOW_REVIEWS = "shadow_reviews"
# Statuses of a shadow review that has not started calling the reviewer.
QUEUED_REVIEW_STATUSES = ("queued", "reserved", "pending")
REVIEW_STATUS_DROPPED = "dropped"

BASIS_INTERNAL = "internal"
BASIS_OPT_IN = "opt_in"


# --------------------------------------------------------------------------- #
# users.is_internal
# --------------------------------------------------------------------------- #


async def is_user_internal(db, user_id: Optional[str]) -> bool:
    if not user_id:
        return False
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "is_internal": 1})
    return bool(doc) and doc.get("is_internal") is True


async def set_user_internal(
    db,
    *,
    user_id: str,
    is_internal: bool,
    actor,
    request=None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Admin-only: set ``users.is_internal``. One guarded update, so two
    concurrent identical requests produce one change and one audit entry.
    Returns ``{"user_id", "is_internal", "changed"}``; raises ``LookupError``
    for an unknown user.

    Removing the flag also removes what only the flag justified: the user's
    internal-basis adjudication excerpts and queued internal-basis reviews.
    """
    from core.audit import record_audit_log

    target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "is_internal": 1})
    if not target:
        raise LookupError(user_id)
    new = bool(is_internal)
    now = utcnow()
    result = await db.users.update_one(
        {"id": user_id, "is_internal": {"$ne": new}},
        {"$set": {"is_internal": new, "is_internal_updated_at": now, "is_internal_updated_by": actor.id}},
    )
    if not getattr(result, "modified_count", 0):
        return {"user_id": user_id, "is_internal": new, "changed": False}

    old = not new
    changes: Dict[str, Any] = {"is_internal": {"old": old, "new": new}}
    if reason:
        changes["reason"] = reason[:500]
    await record_audit_log(
        db, request, actor, "grant_internal" if new else "revoke_internal", "user",
        resource_id=user_id, changes=changes,
    )
    if not new:
        from core.adjudication import purge_user_excerpts

        await purge_user_excerpts(db, user_id, basis=BASIS_INTERNAL)
        await drop_queued_shadow_reviews(db, user_id, basis=BASIS_INTERNAL, reason="internal_flag_removed")
    return {"user_id": user_id, "is_internal": new, "changed": True}


# --------------------------------------------------------------------------- #
# Eligibility
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class EligibilityDecision:
    allowed: bool
    # "internal" | "opt_in" when allowed; None otherwise.
    basis: Optional[str]
    reason: str

    def to_doc(self) -> Dict[str, Any]:
        return {"allowed": self.allowed, "basis": self.basis, "reason": self.reason}


@dataclass(frozen=True)
class ReviewEligibility:
    build_id: Optional[str]
    owner_user_id: Optional[str]
    credential_mode: str
    ai_review: EligibilityDecision
    human_adjudication: EligibilityDecision

    def to_doc(self) -> Dict[str, Any]:
        return {
            "build_id": self.build_id,
            "owner_user_id": self.owner_user_id,
            "credential_mode": self.credential_mode,
            "ai_review": self.ai_review.to_doc(),
            "human_adjudication": self.human_adjudication.to_doc(),
        }


def _deny(reason: str) -> EligibilityDecision:
    return EligibilityDecision(False, None, reason)


def decide_review_eligibility(
    *,
    is_internal: bool,
    credential_mode: Union[str, CredentialMode],
    consents: Iterable[str],
    external_adjudication_opt_in: bool,
) -> Tuple[EligibilityDecision, EligibilityDecision]:
    """Pure decision. ``consents`` are the scopes that count *for this
    build* (see the module docstring); returns ``(ai_review,
    human_adjudication)``."""
    scopes: FrozenSet[str] = frozenset(consents or ())
    try:
        mode = CredentialMode(getattr(credential_mode, "value", credential_mode))
    except ValueError:
        mode = CredentialMode.BYOK  # unknown: fail closed
    internal = is_internal is True

    # AI shadow review (U8), behind the BYOK boundary (U2). The boundary
    # check is unconditional and comes first: internal owners are not exempt.
    boundary = ProcessingBoundary(
        credential_mode=mode,
        consents=scopes & {SCOPE_PLATFORM_MODEL_PROCESSING},
        source="eligibility",
    )
    decision = check_platform_model_allowed(boundary, Purpose.SHADOW)
    if not decision.allowed:
        ai = _deny("byok_without_platform_model_processing_consent")
    elif internal:
        ai = EligibilityDecision(True, BASIS_INTERNAL, "internal_owner")
    elif SCOPE_AI_QUALITY_REVIEW in scopes:
        ai = EligibilityDecision(True, BASIS_OPT_IN, "consent:ai_quality_review")
    else:
        ai = _deny("not_internal_and_no_ai_quality_review_consent")

    # Human adjudication (C7, U12).
    if internal:
        human = EligibilityDecision(True, BASIS_INTERNAL, "internal_owner")
    elif not external_adjudication_opt_in:
        human = _deny("external_adjudication_disabled")
    elif SCOPE_HUMAN_QUALITY_REVIEW in scopes:
        human = EligibilityDecision(True, BASIS_OPT_IN, "consent:human_quality_review")
    else:
        human = _deny("not_internal_and_no_human_quality_review_consent")
    return ai, human


def _as_utc(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return _as_utc(parsed)
    return None


def consents_for_build(
    consent_docs: Iterable[Dict[str, Any]],
    *,
    build_created_at: Any,
    snapshot: Optional[ProcessingBoundary],
) -> FrozenSet[str]:
    """The consent scopes that count for one build: active now, and granted
    no later than the build's admission. ``platform_model_processing`` for a
    BYOK build is taken from the admission snapshot (A2's rule) and must
    also still be active."""
    admitted = _as_utc(build_created_at)
    active_now = set()
    counted = set()
    for doc in consent_docs or ():
        if not consent_counts(doc):
            continue
        scope = doc.get("scope")
        active_now.add(scope)
        granted = _as_utc(doc.get("granted_at"))
        if admitted is not None and granted is not None and granted <= admitted:
            counted.add(scope)
    counted.discard(SCOPE_PLATFORM_MODEL_PROCESSING)
    if (
        snapshot is not None
        and snapshot.has_consent(SCOPE_PLATFORM_MODEL_PROCESSING)
        and SCOPE_PLATFORM_MODEL_PROCESSING in active_now
    ):
        counted.add(SCOPE_PLATFORM_MODEL_PROCESSING)
    return frozenset(counted)


_BUILD_PROJECTION = {"_id": 0, "id": 1, "user_id": 1, "project_id": 1, "created_at": 1, "processing_boundary": 1}


async def evaluate_review_eligibility(
    db,
    build: Union[str, Dict[str, Any]],
    *,
    owner_doc: Optional[Dict[str, Any]] = None,
) -> ReviewEligibility:
    """Whether ``build`` (an id or a build document) may get an AI shadow
    review and whether it may be adjudicated by a human, decided now.

    Fails closed: an unknown build or owner denies both; a consent lookup
    error counts as no consents; a missing or malformed boundary snapshot is
    read as BYOK with no consents."""
    from core.config import get_settings

    build_doc = build if isinstance(build, dict) else await db.builds.find_one({"id": build}, _BUILD_PROJECTION)
    if not build_doc:
        denied = _deny("build_not_found")
        return ReviewEligibility(build if isinstance(build, str) else None, None, CredentialMode.BYOK.value, denied, denied)
    build_id = build_doc.get("id")
    owner_id = build_doc.get("user_id")
    if owner_doc is None and owner_id:
        owner_doc = await db.users.find_one({"id": owner_id}, {"_id": 0, "id": 1, "is_internal": 1})
    if not owner_doc:
        denied = _deny("owner_not_found")
        return ReviewEligibility(build_id, owner_id, CredentialMode.BYOK.value, denied, denied)

    snapshot = ProcessingBoundary.from_doc(build_doc.get("processing_boundary"))
    mode = snapshot.credential_mode if snapshot is not None else CredentialMode.BYOK
    try:
        consent_docs = await list_consents(db, owner_id)
    except Exception:
        logger.warning("consent lookup failed for %s; deciding with no consents", owner_id, exc_info=True)
        consent_docs = []
    scopes = consents_for_build(consent_docs, build_created_at=build_doc.get("created_at"), snapshot=snapshot)
    ai, human = decide_review_eligibility(
        is_internal=owner_doc.get("is_internal") is True,
        credential_mode=mode,
        consents=scopes,
        external_adjudication_opt_in=bool(get_settings().external_adjudication_opt_in),
    )
    return ReviewEligibility(build_id, owner_id, mode.value, ai, human)


# --------------------------------------------------------------------------- #
# Consent revocation effects
# --------------------------------------------------------------------------- #

AiReviewRevocationHandler = Callable[[Any, str], Awaitable[Any]]
_AI_REVIEW_REVOCATION_HANDLERS: List[AiReviewRevocationHandler] = []


def register_ai_review_revocation_handler(handler: AiReviewRevocationHandler) -> AiReviewRevocationHandler:
    """S1 hook: ``handler(db, user_id)`` runs whenever ``ai_quality_review``
    is revoked (after the queued ``shadow_reviews`` are dropped). Use it for
    anything the default drop cannot reach, e.g. in-memory queues. Usable
    as a decorator; registering the same handler twice is a no-op."""
    if handler not in _AI_REVIEW_REVOCATION_HANDLERS:
        _AI_REVIEW_REVOCATION_HANDLERS.append(handler)
    return handler


def unregister_ai_review_revocation_handler(handler: AiReviewRevocationHandler) -> None:
    if handler in _AI_REVIEW_REVOCATION_HANDLERS:
        _AI_REVIEW_REVOCATION_HANDLERS.remove(handler)


def _basis_filter(basis: Optional[str]) -> Dict[str, Any]:
    if basis == BASIS_INTERNAL:
        return {"consent_basis": BASIS_INTERNAL}
    if basis == "not_internal":
        return {"consent_basis": {"$ne": BASIS_INTERNAL}}
    return {}


async def drop_queued_shadow_reviews(
    db, user_id: str, *, basis: Optional[str] = None, reason: str = "consent_revoked",
) -> int:
    """Drop ``user_id``'s shadow reviews that have not started. Each is
    settled at zero cost through T4 (``core.shadow_budget``), so a budget
    reservation it holds is released exactly once. ``basis`` limits the
    drop to ``internal`` or ``not_internal`` reviews; None drops all."""
    from core.shadow_budget import settle_shadow_review

    query = {
        "owner_user_id": user_id,
        "status": {"$in": list(QUEUED_REVIEW_STATUSES)},
        "settled": {"$ne": True},
        **_basis_filter(basis),
    }
    docs = await db[SHADOW_REVIEWS].find(query, {"_id": 0, "id": 1}).to_list(None)
    dropped = 0
    for doc in docs:
        result = await settle_shadow_review(
            db, review_id=doc["id"], actual_usd=0.0, actual_calls=0, status=REVIEW_STATUS_DROPPED,
            extra={"dropped_reason": reason, "dropped_at": utcnow()}, only_if_status=QUEUED_REVIEW_STATUSES,
        )
        dropped += int(result.applied)
    return dropped


async def on_consent_revoked(db, *, user_id: str, scope: str) -> Dict[str, int]:
    """Revocation effects (§5.4): ``human_quality_review`` purges the user's
    adjudication excerpts (PV-2); ``ai_quality_review`` drops their queued
    reviews and calls S1's registered handlers. Material that the internal
    rule still justifies (the user is internal now) is kept."""
    internal = await is_user_internal(db, user_id)
    basis = "not_internal" if internal else None
    if scope == SCOPE_HUMAN_QUALITY_REVIEW:
        from core.adjudication import purge_user_excerpts

        return {"excerpts_purged": await purge_user_excerpts(db, user_id, basis=basis)}
    if scope == SCOPE_AI_QUALITY_REVIEW:
        dropped = await drop_queued_shadow_reviews(db, user_id, basis=basis)
        for handler in list(_AI_REVIEW_REVOCATION_HANDLERS):
            await handler(db, user_id)
        return {"reviews_dropped": dropped}
    return {}
