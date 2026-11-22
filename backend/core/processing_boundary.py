"""The BYOK processing boundary (docs/architecture/agent-collaboration-plan.md
§5, decision U2).

> For a BYOK build, customer content may be sent only to the customer's own
> provider, using the customer's key. No Forge-credential model call may
> receive it unless the owner holds an active ``platform_model_processing``
> consent captured before the build started. No additional billed call on
> the customer's key happens without explicit authorization.

Every Forge-credential model call that can touch build content passes
``assert_platform_model_allowed(boundary, purpose)``. Callers today: the
router's platform path (``core/llm/router.py``), the output L-tier and the
input classifier (``gateway/``), retrieval embeddings
(``retrieval/embeddings.py``) and the specialist-shadow enqueue point.

**This module is unconditional code, not a feature flag** (§5.2, §18.1): no
rollout flag or rollback state can switch it off.

The boundary is snapshotted once per build (at admission in
``api/builds.py``; at task start for builds admitted before A2 existed) and
carried through the build via a context variable set in
``tasks/build_tasks.py``. Semantics (BY-7): a grant made mid-build never
widens a running build; a revocation narrows it at the next operation
(``refresh_boundary``). Where no snapshot exists the safe default applies: a
request that carries a BYOK credential is BYOK with no consents.
"""

from __future__ import annotations

import contextvars
import logging
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Any, Dict, FrozenSet, Iterable, Iterator, List, Optional

from core.data_use_consents import (
    SCOPE_BYOK_AUTO_RETRY,
    SCOPE_PLATFORM_MODEL_PROCESSING,
    ActiveConsents,
    get_active_consents,
)

logger = logging.getLogger(__name__)


class CredentialMode(str, Enum):
    FORGE = "forge"
    BYOK = "byok"


class Purpose(str, Enum):
    """`ai_usage.purpose` values (§15.2) and the channels the boundary
    distinguishes."""

    GENERATION = "generation"
    REPAIR = "repair"
    RETRY = "retry"
    FALLBACK = "fallback"
    GUARDRAIL_OUTPUT = "guardrail_output"
    GUARDRAIL_INPUT = "guardrail_input"
    RETRIEVAL_EMBEDDING = "retrieval_embedding"
    RECOVERY = "recovery"
    SHADOW = "shadow"
    MONITORING = "monitoring"
    CACHE_HIT = "cache_hit"


# Forge-credential processing of BYOK content that a
# `platform_model_processing` consent can authorize (§5.3, §5.4).
CONSENT_GATED_PURPOSES: FrozenSet[Purpose] = frozenset({
    Purpose.GUARDRAIL_OUTPUT,
    Purpose.GUARDRAIL_INPUT,
    Purpose.RETRIEVAL_EMBEDDING,
    Purpose.SHADOW,
    Purpose.MONITORING,
})

# Never on a Forge credential for a BYOK build, consent or not: no silent
# switch to Forge keys (C4) and no platform-key recovery (U1).
NEVER_FOR_BYOK_PURPOSES: FrozenSet[Purpose] = frozenset({
    Purpose.GENERATION,
    Purpose.REPAIR,
    Purpose.RETRY,
    Purpose.FALLBACK,
    Purpose.RECOVERY,
    Purpose.CACHE_HIT,
})


def coerce_purpose(value: Any, default: Purpose = Purpose.GENERATION) -> Purpose:
    if isinstance(value, Purpose):
        return value
    if value is None:
        return default
    try:
        return Purpose(str(value))
    except ValueError:
        # An unknown purpose is treated as generation, the strictest class
        # for BYOK (never allowed on a Forge credential).
        return Purpose.GENERATION


@dataclass(frozen=True)
class ProcessingBoundary:
    """`build.processing_boundary` (§15.1): `{credential_mode, consents[],
    policy_version}` plus the N of an authorized `byok_auto_retry`."""

    credential_mode: CredentialMode
    consents: FrozenSet[str] = frozenset()
    policy_version: str = ""
    byok_auto_retry_max: int = 0
    owner_user_id: Optional[str] = None
    # snapshot (persisted at admission/start) | default (derived on the
    # fly because no snapshot was available) | narrowed (a snapshot after
    # a revocation was observed).
    source: str = "snapshot"

    @property
    def is_byok(self) -> bool:
        return self.credential_mode == CredentialMode.BYOK

    def has_consent(self, scope: str) -> bool:
        return scope in self.consents

    @property
    def platform_model_processing(self) -> bool:
        return self.has_consent(SCOPE_PLATFORM_MODEL_PROCESSING)

    @property
    def auto_retry_allowance(self) -> int:
        """N extra billed calls on the customer's key this build may make
        automatically. Always 0 for Forge builds (the rule does not apply)
        and for BYOK builds without consent."""
        if not self.is_byok or not self.has_consent(SCOPE_BYOK_AUTO_RETRY):
            return 0
        return max(0, int(self.byok_auto_retry_max))

    def to_doc(self) -> Dict[str, Any]:
        return {
            "credential_mode": self.credential_mode.value,
            "consents": sorted(self.consents),
            "policy_version": self.policy_version,
            "byok_auto_retry_max": int(self.byok_auto_retry_max),
            "owner_user_id": self.owner_user_id,
        }

    @classmethod
    def from_doc(cls, doc: Any) -> Optional["ProcessingBoundary"]:
        """Parse a stored snapshot. A malformed snapshot fails closed: it is
        read as BYOK with no consents rather than guessed at."""
        if not doc:
            return None
        if isinstance(doc, ProcessingBoundary):
            return doc
        if not isinstance(doc, dict):
            logger.error("processing_boundary snapshot is not a mapping; failing closed")
            return cls(credential_mode=CredentialMode.BYOK, source="snapshot")
        try:
            mode = CredentialMode(doc.get("credential_mode"))
        except ValueError:
            logger.error("processing_boundary has invalid credential_mode %r; failing closed", doc.get("credential_mode"))
            return cls(credential_mode=CredentialMode.BYOK, owner_user_id=doc.get("owner_user_id"))
        consents = doc.get("consents") or []
        if not isinstance(consents, (list, tuple, set, frozenset)):
            consents = []
        try:
            retry_max = int(doc.get("byok_auto_retry_max") or 0)
        except (TypeError, ValueError):
            retry_max = 0
        return cls(
            credential_mode=mode,
            consents=frozenset(str(c) for c in consents),
            policy_version=str(doc.get("policy_version") or ""),
            byok_auto_retry_max=max(0, retry_max),
            owner_user_id=doc.get("owner_user_id"),
            source="snapshot",
        )

    def narrowed_to(self, active: ActiveConsents) -> "ProcessingBoundary":
        """Intersect with what is active now. Never adds a scope (BY-7)."""
        kept = frozenset(self.consents & set(active.scopes))
        retry_max = min(self.byok_auto_retry_max, active.byok_auto_retry_max)
        if SCOPE_BYOK_AUTO_RETRY not in kept:
            retry_max = 0
        if kept == self.consents and retry_max == self.byok_auto_retry_max:
            return self
        return replace(self, consents=kept, byok_auto_retry_max=retry_max, source="narrowed")

    @classmethod
    def forge_default(cls, owner_user_id: Optional[str] = None) -> "ProcessingBoundary":
        return cls(credential_mode=CredentialMode.FORGE, owner_user_id=owner_user_id, source="default")

    @classmethod
    def byok_default(cls, owner_user_id: Optional[str] = None) -> "ProcessingBoundary":
        """Safe default for a BYOK request with no snapshot: no consents."""
        return cls(credential_mode=CredentialMode.BYOK, owner_user_id=owner_user_id, source="default")


@dataclass(frozen=True)
class BoundaryDecision:
    allowed: bool
    purpose: Purpose
    reason: str


class PlatformProcessingDenied(Exception):
    """A Forge-credential model call was refused by the processing boundary.

    Non-transient: retrying cannot change the outcome, so neither the router
    nor the Celery task may retry it. ``error_class`` is
    ``byok_unavailable`` when the call needed a Forge key *instead of* the
    customer's key (generation, repair, retry, fallback, recovery), which is
    the §5.5 "missing or invalid key at run time" case."""

    retryable = False

    def __init__(self, decision: BoundaryDecision):
        self.decision = decision
        self.purpose = decision.purpose
        self.reason = decision.reason
        self.error_class = (
            "byok_unavailable" if decision.purpose in NEVER_FOR_BYOK_PURPOSES else "platform_processing_not_permitted"
        )
        super().__init__(
            f"Forge-credential model call refused by the BYOK processing boundary "
            f"(purpose={decision.purpose.value}, reason={decision.reason})"
        )


def check_platform_model_allowed(boundary: Optional[ProcessingBoundary], purpose: Any) -> BoundaryDecision:
    """Pure decision: may a Forge-credential model receive this content for
    ``purpose``? ``boundary=None`` resolves from the current build scope,
    else the Forge default (no BYOK credential is known)."""
    p = coerce_purpose(purpose)
    b = boundary if boundary is not None else resolve_boundary()
    if not b.is_byok:
        return BoundaryDecision(True, p, "forge_credential")
    if p in NEVER_FOR_BYOK_PURPOSES:
        return BoundaryDecision(False, p, "byok_never_forge_credential")
    if p in CONSENT_GATED_PURPOSES and b.platform_model_processing:
        return BoundaryDecision(True, p, "consent:platform_model_processing")
    return BoundaryDecision(False, p, "byok_without_consent")


def assert_platform_model_allowed(boundary: Optional[ProcessingBoundary], purpose: Any) -> BoundaryDecision:
    """The choke point. Raises ``PlatformProcessingDenied`` when refused."""
    decision = check_platform_model_allowed(boundary, purpose)
    if not decision.allowed:
        logger.info(
            "processing boundary refused a Forge-credential call: purpose=%s reason=%s",
            decision.purpose.value, decision.reason,
        )
        raise PlatformProcessingDenied(decision)
    return decision


# --------------------------------------------------------------------------- #
# Build scope (context variable)
# --------------------------------------------------------------------------- #


@dataclass
class BuildScope:
    """Per-build context carried through the orchestrator's call tree.
    ``asyncio.create_task`` copies it, so fire-and-forget work launched by
    the build (specialist shadow) sees the same boundary."""

    boundary: ProcessingBoundary
    build_id: Optional[str] = None
    user_id: Optional[str] = None
    project_id: Optional[str] = None
    org_id: Optional[str] = None
    # Guardrail outcomes collected for this build (GR-5/GR-6). Read by
    # tasks/build_tasks.py at the end of the run; B2/A3 consume them.
    guardrail_outcomes: List[Dict[str, Any]] = field(default_factory=list)
    # In-process count of extra customer-key calls, used only when there is
    # no build document to hold the guarded counter.
    byok_extra_calls: int = 0


_build_scope: contextvars.ContextVar[Optional[BuildScope]] = contextvars.ContextVar(
    "forge_build_scope", default=None
)


@contextmanager
def build_scope(
    boundary: ProcessingBoundary,
    *,
    build_id: Optional[str] = None,
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    org_id: Optional[str] = None,
) -> Iterator[BuildScope]:
    scope = BuildScope(
        boundary=boundary, build_id=build_id, user_id=user_id, project_id=project_id, org_id=org_id,
    )
    token = _build_scope.set(scope)
    try:
        yield scope
    finally:
        _build_scope.reset(token)


def current_build_scope() -> Optional[BuildScope]:
    return _build_scope.get()


def current_boundary() -> Optional[ProcessingBoundary]:
    scope = _build_scope.get()
    return scope.boundary if scope is not None else None


def resolve_boundary(
    explicit: Optional[ProcessingBoundary] = None,
    *,
    byok_request: bool = False,
    user_id: Optional[str] = None,
) -> ProcessingBoundary:
    """Explicit snapshot, else the build scope's, else the safe default:
    BYOK with no consents for a request carrying a customer key, Forge
    otherwise. A request carrying a customer key is never treated as Forge,
    even if a (mismatched) Forge snapshot is in scope."""
    boundary = explicit if explicit is not None else current_boundary()
    if boundary is None:
        boundary = (
            ProcessingBoundary.byok_default(user_id) if byok_request else ProcessingBoundary.forge_default(user_id)
        )
    if byok_request and not boundary.is_byok:
        boundary = ProcessingBoundary.byok_default(boundary.owner_user_id or user_id)
    return boundary


# --------------------------------------------------------------------------- #
# Snapshot and refresh
# --------------------------------------------------------------------------- #

_BYOK_PLANS = ("pro", "enterprise")


def credential_mode_for_user_doc(user_doc: Optional[Dict[str, Any]]) -> CredentialMode:
    """Mirrors ``Orchestrator._is_byok_active`` (stored key + Pro/Enterprise
    plan): if the orchestrator will run the build as BYOK, the boundary is
    BYOK. A key that later fails to resolve does not fall back to Forge:
    the platform path refuses it (``byok_unavailable``)."""
    if not user_doc or not user_doc.get("llm_api_key"):
        return CredentialMode.FORGE
    plan = user_doc.get("plan")
    plan = getattr(plan, "value", plan)
    return CredentialMode.BYOK if plan in _BYOK_PLANS else CredentialMode.FORGE


async def snapshot_boundary(
    db,
    user_id: Optional[str],
    *,
    user_doc: Optional[Dict[str, Any]] = None,
    include_consents: bool = True,
) -> ProcessingBoundary:
    """Compute the boundary for a build being admitted (or started, for a
    pre-A2 build) now. A consent lookup failure yields no consents, the
    narrowest boundary."""
    from core.config import get_settings

    if user_doc is None and user_id:
        user_doc = await db.users.find_one(
            {"id": user_id}, {"_id": 0, "plan": 1, "llm_api_key": 1}
        )
    mode = credential_mode_for_user_doc(user_doc)
    active = ActiveConsents.none()
    if include_consents and mode == CredentialMode.BYOK:
        try:
            active = await get_active_consents(db, user_id)
        except Exception:
            logger.warning("consent lookup failed for %s; snapshotting with no consents", user_id, exc_info=True)
            active = ActiveConsents.none()
    return ProcessingBoundary(
        credential_mode=mode,
        consents=frozenset(active.scopes),
        policy_version=get_settings().processing_policy_version,
        byok_auto_retry_max=active.byok_auto_retry_max,
        owner_user_id=user_id,
        source="snapshot",
    )


async def refresh_boundary(boundary: ProcessingBoundary, db=None) -> ProcessingBoundary:
    """Narrow ``boundary`` to the consents active now (BY-7). Only BYOK
    boundaries holding a consent can change, so this is a no-op (no I/O) for
    every other build. If the lookup fails the boundary narrows to no
    consents: an unverifiable consent does not count. The narrowed boundary
    is written back to the build scope so later operations keep it."""
    if not boundary.is_byok or not boundary.consents:
        return boundary
    try:
        if db is None:
            from core.database import get_db

            db = await get_db()
        active = await get_active_consents(db, boundary.owner_user_id)
    except Exception:
        logger.warning("consent refresh failed for %s; narrowing to no consents", boundary.owner_user_id, exc_info=True)
        active = ActiveConsents.none()
    narrowed = boundary.narrowed_to(active)
    scope = _build_scope.get()
    if narrowed is not boundary and scope is not None and scope.boundary == boundary:
        scope.boundary = narrowed
    return narrowed


async def reserve_byok_extra_call(
    boundary: ProcessingBoundary,
    *,
    build_id: Optional[str] = None,
    db=None,
) -> bool:
    """Authorize one more billed call on the customer's key (a repair or a
    retry). True only for a BYOK boundary with an active ``byok_auto_retry``
    consent whose N is not yet used up. With a build id the counter is a
    guarded single-document ``$inc`` on the build, so repairs and Celery
    retries share one bound of N across processes."""
    allowance = boundary.auto_retry_allowance
    if allowance <= 0:
        return False
    if build_id:
        try:
            if db is None:
                from core.database import get_db

                db = await get_db()
            updated = await db.builds.find_one_and_update(
                {"id": build_id, "byok_extra_calls": {"$not": {"$gte": allowance}}},
                {"$inc": {"byok_extra_calls": 1}},
            )
            return updated is not None
        except Exception:
            logger.warning("byok extra-call reservation failed for build %s; refusing", build_id, exc_info=True)
            return False
    scope = _build_scope.get()
    if scope is None:
        return False
    if scope.byok_extra_calls >= allowance:
        return False
    scope.byok_extra_calls += 1
    return True


def record_guardrail_outcome(outcome: Dict[str, Any]) -> None:
    scope = _build_scope.get()
    if scope is not None:
        scope.guardrail_outcomes.append(dict(outcome))


def consents_from(values: Iterable[str]) -> FrozenSet[str]:
    return frozenset(str(v) for v in values)
