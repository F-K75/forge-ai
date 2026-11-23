"""Per-request attempt accounting shared by the gateway and the router
(docs/architecture/agent-collaboration-plan.md §7.1, §15.2).

One ``AttemptAccounting`` is created per gateway request (or per direct
router call) and passed down explicitly rather than through a context
variable, so streaming generators never have to set context state. It
carries the processing boundary the request runs under, the channel
(``purpose``), who the call is made for (``principal``), and the attempt
sequence counter that orders every provider call made for the request --
primary, retry, fallback, repair, guardrail screen, classifier.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from core.operation_context import OperationContext, current_operation
from core.processing_boundary import (
    ProcessingBoundary,
    Purpose,
    coerce_purpose,
    current_build_scope,
    resolve_boundary,
)

logger = logging.getLogger(__name__)

_GENERATION_CHANNEL = frozenset({
    Purpose.GENERATION, Purpose.REPAIR, Purpose.RETRY, Purpose.FALLBACK, Purpose.CACHE_HIT,
})

_PLATFORM_PRINCIPAL_BY_PURPOSE = {
    Purpose.GUARDRAIL_OUTPUT: "platform:guardrail",
    Purpose.GUARDRAIL_INPUT: "platform:guardrail",
    Purpose.SHADOW: "platform:shadow",
    Purpose.MONITORING: "platform:monitoring",
    Purpose.RETRIEVAL_EMBEDDING: "platform:retrieval",
    Purpose.RECOVERY: "platform:recovery",
}


def unified_recording_enabled() -> bool:
    from core.config import get_settings

    return bool(get_settings().unified_usage_recording)


@dataclass
class AttemptAccounting:
    boundary: ProcessingBoundary
    purpose: Purpose = Purpose.GENERATION
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    project_id: Optional[str] = None
    build_id: Optional[str] = None
    agent: Optional[str] = None
    operation: Optional[OperationContext] = None
    _seq: int = 0

    @classmethod
    def create(
        cls,
        *,
        purpose: Any = None,
        boundary: Optional[ProcessingBoundary] = None,
        byok_request: bool = False,
        request_id: Optional[str] = None,
        user_id: Optional[str] = None,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
        build_id: Optional[str] = None,
        agent: Optional[str] = None,
    ) -> "AttemptAccounting":
        scope = current_build_scope()
        return cls(
            boundary=resolve_boundary(boundary, byok_request=byok_request, user_id=user_id),
            purpose=coerce_purpose(purpose),
            request_id=request_id or str(uuid.uuid4()),
            user_id=user_id,
            org_id=org_id or (scope.org_id if scope else None),
            project_id=project_id or (scope.project_id if scope else None),
            build_id=build_id or (scope.build_id if scope else None),
            agent=agent,
            operation=current_operation(),
        )

    def derive(self, purpose: Any, *, agent: Optional[str] = None) -> "AttemptAccounting":
        """Same request, another channel (a repair, a guardrail screen).
        Shares the attempt counter through the operation, or explicitly."""
        child = AttemptAccounting(
            boundary=self.boundary,
            purpose=coerce_purpose(purpose),
            request_id=self.request_id,
            user_id=self.user_id,
            org_id=self.org_id,
            project_id=self.project_id,
            build_id=self.build_id,
            agent=agent or self.agent,
            operation=self.operation,
        )
        child._parent = self  # type: ignore[attr-defined]
        return child

    def next_seq(self) -> int:
        parent = getattr(self, "_parent", None)
        if parent is not None:
            return parent.next_seq()
        if self.operation is not None:
            return self.operation.next_attempt_seq()
        self._seq += 1
        return self._seq

    @property
    def operation_id(self) -> Optional[str]:
        return self.operation.operation_id if self.operation else None

    @property
    def dispatch_no(self) -> Optional[int]:
        return self.operation.dispatch_no if self.operation else None

    @property
    def principal(self) -> str:
        return _PLATFORM_PRINCIPAL_BY_PURPOSE.get(self.purpose, "user")

    @property
    def is_platform(self) -> bool:
        return self.principal != "user"

    def account_for(self, *, credential: str) -> str:
        if credential == "byok":
            return "customer_provider"
        if self.purpose in (Purpose.GUARDRAIL_OUTPUT, Purpose.GUARDRAIL_INPUT):
            return "guardrail"
        if self.purpose == Purpose.SHADOW:
            return "shadow"
        if self.purpose == Purpose.MONITORING:
            return "monitoring"
        if self.purpose == Purpose.RECOVERY:
            return "recovery"
        # A1: the ledger names the account of a dispatch -- `free_grant` for
        # a free-grant build, `recovery` for the C9 dispatch 2 (§7.2).
        op_account = self.operation.account if self.operation is not None else None
        if self.build_id and op_account in ("free_grant", "recovery"):
            return op_account
        # Generation channel and build-path retrieval: `generation` inside a
        # build, `interactive` for non-build features (§7.2).
        return "generation" if self.build_id else "interactive"

    def attempt_purpose(self, attempt_kind: str) -> str:
        """`purpose` of one attempt. On the generation channel a retry or a
        fallback is its own purpose; other channels keep theirs and the kind
        is carried in `attempt_kind`."""
        if self.purpose in _GENERATION_CHANNEL and self.purpose == Purpose.GENERATION:
            if attempt_kind in ("retry", "fallback", "cache_hit"):
                return attempt_kind
        return self.purpose.value

    async def record(
        self,
        *,
        outcome: str,
        credential: str,
        provider: Optional[str],
        model: Optional[str],
        attempt_kind: str = "primary",
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        cached_tokens: int = 0,
        error_class: Any = None,
        latency_ms: Optional[float] = None,
        force: bool = False,
    ) -> Optional[dict]:
        """Write one `ai_usage` row for an attempt. No-op unless unified
        recording is on (or ``force``). Never raises: a usage-write failure
        must not fail the call it describes, but it is logged."""
        if self.build_id and (prompt_tokens or completion_tokens):
            # A1 (G3): meter the attempt on the build's token meters whether
            # or not unified recording is on; a no-op outside a ledger build.
            try:
                from core.quotas import record_attempt_tokens

                await record_attempt_tokens(
                    int(prompt_tokens or 0) + int(completion_tokens or 0),
                    account=self.account_for(credential=credential),
                )
            except Exception:
                logger.debug("token meter update failed", exc_info=True)
        if not (force or unified_recording_enabled()):
            return None
        from core.ai_usage import record_provider_attempt

        scope = current_build_scope()
        beneficiary = self.user_id or (scope.user_id if scope else None) or self.boundary.owner_user_id
        try:
            return await record_provider_attempt(
                purpose=self.attempt_purpose(attempt_kind),
                attempt_kind=attempt_kind,
                outcome=outcome,
                credential=credential,
                account=self.account_for(credential=credential),
                provider=provider,
                model=model,
                principal=self.principal,
                user_id=self.user_id,
                beneficiary_user_id=beneficiary,
                org_id=self.org_id,
                project_id=self.project_id,
                build_id=self.build_id,
                agent=self.agent,
                operation_id=self.operation_id,
                dispatch_no=self.dispatch_no,
                attempt_seq=self.next_seq(),
                request_id=self.request_id,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cached_tokens=cached_tokens,
                error_class=error_class,
                credential_mode=self.boundary.credential_mode.value,
                latency_ms=latency_ms,
            )
        except Exception:
            logger.exception(
                "Failed to record ai_usage attempt (request=%s purpose=%s outcome=%s)",
                self.request_id, self.purpose.value, outcome,
            )
            return None
