from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.json_utils import strip_markdown_fences
from core.config import get_settings
from core.llm.accounting import AttemptAccounting
from core.llm.guardrail_errors import GuardrailBlocked
from core.llm.guardrail_policy import parse_guardrail_policy
from core.llm.provider import CompletionResponse
from core.llm.router import LLMRouter, get_llm_router
from core.metrics import (
    llm_failovers_total,
    llm_guardrail_blocked_total,
    llm_request_duration_seconds,
    llm_requests_total,
    llm_retry_attempts_total,
)
from core.processing_boundary import (
    ProcessingBoundary,
    Purpose,
    coerce_purpose,
    current_boundary,
    record_guardrail_outcome,
    refresh_boundary,
    reserve_byok_extra_call,
    resolve_boundary,
    snapshot_boundary,
)
from gateway.audit import AuditLogger, get_audit_logger
from gateway.guardrails import (
    BASELINE_CATEGORIES,
    BLOCKED_MESSAGE,
    LTIER_BLOCKED,
    GuardrailOutcome,
    GuardrailsEngine,
    IncrementalDTierScanner,
    _detect_blocked_content,
    get_guardrails_engine,
)
from gateway.models import GatewayRequest, GatewayResponse
from optimizer.service import AIOptimizer, get_optimizer

logger = logging.getLogger(__name__)

# Legacy windowed guardrail screening for AIGateway.stream() (the
# `guardrail_v2` rollback path): text is released to the caller in windows,
# each window's release gated on a guardrails screen of the *accumulated*
# text so far. Guardrail v2 replaces this with an incremental, linear D-tier
# scan and at most one L-tier screen per artifact (§4).
_GUARDRAIL_WINDOW_CHARS = 400

_REPAIR_NOT_AUTHORIZED = (
    "automatic repair on the customer's own provider key is not authorized "
    "(byok_auto_retry consent required)"
)


class AIGateway:
    """Single entry point for all LLM communication in Forge. Agents and
    HTTP handlers interact only with this class -- never with `LLMRouter`,
    `ProviderRegistry`, or a provider adapter directly.

    This wraps the existing (tested) `LLMRouter`/`AIOptimizer` rather than
    reimplementing routing, retries, failover, or budget enforcement: those
    already live in `LLMRouter.generate`/`stream`. The Gateway's job is to
    give callers one unified request/response contract, an audit trail, and
    the handful of capabilities (`validate_output`, `estimate_*`) that don't
    belong in the router itself.

    A2: every request runs under a processing boundary (explicit, the build
    scope's snapshot, or the safe default) that the router and guardrails
    enforce; structured-output repair never re-calls a customer's key
    without `byok_auto_retry` consent; guardrail v2 (flag `guardrail_v2`)
    runs the D-tier incrementally and the L-tier at most once per artifact.
    """

    def __init__(
        self,
        *,
        router: Optional[LLMRouter] = None,
        optimizer: Optional[AIOptimizer] = None,
        audit_logger: Optional[AuditLogger] = None,
        guardrails: Optional[GuardrailsEngine] = None,
    ) -> None:
        self.router = router or get_llm_router()
        self.optimizer = optimizer or get_optimizer()
        self.audit_logger = audit_logger or get_audit_logger()
        self.guardrails = guardrails or get_guardrails_engine()

    # ------------------------------------------------------------------ #
    # Boundary and accounting
    # ------------------------------------------------------------------ #

    async def _resolve_boundary(self, request: GatewayRequest) -> ProcessingBoundary:
        explicit = ProcessingBoundary.from_doc(request.processing_boundary) if request.processing_boundary else None
        if (
            explicit is None
            and current_boundary() is None
            and coerce_purpose(request.purpose) == Purpose.MONITORING
            and request.project_id
        ):
            # The repository monitor runs outside builds: its boundary is the
            # project owner's (§5.3). Unknown owner or lookup failure fails
            # closed (BYOK, no consents).
            explicit = await self._project_owner_boundary(request.project_id)
        boundary = resolve_boundary(explicit, byok_request=bool(request.byok), user_id=request.user_id)
        # BY-7: a revocation narrows a running build at its next operation.
        return await refresh_boundary(boundary)

    @staticmethod
    async def _project_owner_boundary(project_id: str) -> ProcessingBoundary:
        try:
            from core.database import get_db

            db = await get_db()
            project = await db.projects.find_one({"id": project_id}, {"_id": 0, "user_id": 1})
            owner = (project or {}).get("user_id")
            if not owner:
                return ProcessingBoundary.byok_default()
            return await snapshot_boundary(db, owner)
        except Exception:
            logger.warning("monitor boundary lookup failed for project %s; failing closed", project_id, exc_info=True)
            return ProcessingBoundary.byok_default()

    @staticmethod
    def _accounting(request: GatewayRequest, request_id: str, boundary: ProcessingBoundary) -> AttemptAccounting:
        return AttemptAccounting.create(
            purpose=request.purpose,
            boundary=boundary,
            byok_request=bool(request.byok),
            request_id=request_id,
            user_id=request.user_id,
            org_id=request.org_id,
            project_id=request.project_id,
            build_id=request.build_id,
            agent=request.agent_name,
        )

    async def _repair_allowed(self, request: GatewayRequest, boundary: ProcessingBoundary) -> bool:
        """One bounded repair for platform-funded output (U13). On a customer
        key only with `byok_auto_retry` consent, counted against its N."""
        if not boundary.is_byok:
            return True
        return await reserve_byok_extra_call(boundary, build_id=request.build_id)

    @staticmethod
    def _publish_outcome(request: GatewayRequest, outcome: GuardrailOutcome) -> Dict[str, Any]:
        data = outcome.to_dict()
        record_guardrail_outcome(data)
        if request.usage_out is not None:
            request.usage_out["guardrail"] = data
        return data

    def _to_response(self, request_id: str, completion: CompletionResponse, latency_ms: float) -> GatewayResponse:
        usage = completion.usage or {}
        return GatewayResponse(
            content=completion.text,
            finish_reason=completion.finish_reason,
            usage=usage,
            latency_ms=latency_ms,
            provider=completion.provider,
            model=completion.model,
            request_id=request_id,
            cost_usd=float(usage.get("cost_usd", 0.0) or 0.0),
            tool_calls=completion.tool_calls,
            raw=completion.raw,
        )

    # ------------------------------------------------------------------ #
    # generate
    # ------------------------------------------------------------------ #

    async def generate(self, request: GatewayRequest) -> GatewayResponse:
        request_id = str(uuid.uuid4())
        attempt_info: Dict[str, int] = {}
        boundary = await self._resolve_boundary(request)
        acct = self._accounting(request, request_id, boundary)
        start = time.perf_counter()
        try:
            completion = await self.router.generate(
                agent_name=request.agent_name,
                messages=request.messages,
                model=request.model,
                task_complexity=request.task_complexity,
                use_retrieval=request.use_retrieval,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                tools=request.tools,
                user_id=request.user_id,
                build_id=request.build_id,
                project_id=request.project_id,
                org_id=request.org_id,
                extra_system=request.system_prompt,
                usage_out=request.usage_out,
                provider_names=request.provider_names,
                byok=request.byok,
                attempt_info=attempt_info,
                accounting=acct,
            )
        except Exception as exc:
            llm_requests_total.labels(
                provider="unknown", model=request.model or "unknown", agent=request.agent_name, status="error",
            ).inc()
            await self.audit_logger.record(
                request_id=request_id,
                provider="unknown",
                model=request.model or "unknown",
                agent_name=request.agent_name,
                retry_attempts=attempt_info.get("attempts", 0),
                failovers=attempt_info.get("failovers", 0),
                policy_decisions=[{"decision": "error", "detail": str(exc)}],
            )
            raise

        latency_ms = (time.perf_counter() - start) * 1000
        response = self._to_response(request_id, completion, latency_ms)
        llm_request_duration_seconds.labels(provider=response.provider, model=response.model).observe(latency_ms / 1000)

        policy_config = await self.router.config_loader.load(agent_name=request.agent_name, org_id=request.org_id)
        policy = policy_config.get("policy") or {}

        if get_settings().guardrail_v2:
            await self._finish_generate_v2(request, response, acct, boundary, policy_config, policy)
        else:
            await self._finish_generate_legacy(request, response, acct, boundary, policy)

        llm_requests_total.labels(
            provider=response.provider,
            model=response.model,
            agent=request.agent_name,
            status="guardrail_blocked" if response.guardrail_blocked else "success",
        ).inc()
        llm_retry_attempts_total.labels(agent=request.agent_name).inc(attempt_info.get("attempts", 0))
        llm_failovers_total.labels(agent=request.agent_name).inc(attempt_info.get("failovers", 0))
        if response.guardrail_blocked:
            for category in response.guardrail_categories or []:
                llm_guardrail_blocked_total.labels(category=category).inc()

        policy_decisions = []
        if response.guardrail_blocked:
            policy_decisions.append({"decision": "guardrail_blocked", "categories": response.guardrail_categories})
        if response.guardrail_unverified:
            policy_decisions.append({"decision": "guardrail_unverified"})
        await self.audit_logger.record(
            request_id=request_id,
            provider=response.provider,
            model=response.model,
            agent_name=request.agent_name,
            retry_attempts=attempt_info.get("attempts", 0),
            failovers=attempt_info.get("failovers", 0),
            policy_decisions=policy_decisions or None,
        )
        return response

    def _repair_fn(self, request: GatewayRequest, acct: AttemptAccounting):
        async def _repair(text: str, schema: Dict[str, Any], errors: List[str]) -> str:
            repair_messages = [
                *request.messages,
                {"role": "assistant", "content": text},
                {
                    "role": "user",
                    "content": (
                        "Your previous response did not match the required JSON "
                        f"schema. Schema: {json.dumps(schema)}. Validation errors: "
                        f"{errors}. Return ONLY the corrected JSON, no prose, no "
                        "markdown fences."
                    ),
                },
            ]
            repair_completion = await self.router.generate(
                agent_name=request.agent_name,
                messages=repair_messages,
                model=request.model,
                max_tokens=request.max_tokens,
                user_id=request.user_id,
                build_id=request.build_id,
                project_id=request.project_id,
                org_id=request.org_id,
                extra_system=request.system_prompt,
                provider_names=request.provider_names,
                byok=request.byok,
                accounting=acct.derive(Purpose.REPAIR),
                # The user content was classified for this operation already.
                classify_input=False,
            )
            return repair_completion.text

        return _repair

    async def _structured(
        self, request: GatewayRequest, response: GatewayResponse, acct: AttemptAccounting,
        boundary: ProcessingBoundary, text: str,
    ) -> Dict[str, Any]:
        """Validate, then at most one repair (if authorized). Returns the
        validation result plus the final artifact text."""
        schema = request.structured_output_schema
        first = await self.validate_output(text, schema)
        if first["valid"]:
            return {**first, "text": text, "repaired": False}
        if not await self._repair_allowed(request, boundary):
            return {
                "valid": False, "errors": [*first["errors"], _REPAIR_NOT_AUTHORIZED],
                "text": text, "repaired": False,
            }
        repaired_text = await self._repair_fn(request, acct)(text, schema, first["errors"])
        second = await self.validate_output(repaired_text, schema)
        return {**second, "text": repaired_text, "repaired": True}

    async def _finish_generate_legacy(
        self, request: GatewayRequest, response: GatewayResponse, acct: AttemptAccounting,
        boundary: ProcessingBoundary, policy: Dict[str, Any],
    ) -> None:
        if policy.get("guardrails_enabled", True):
            categories = list(BASELINE_CATEGORIES) + list(policy.get("blocked_categories") or [])
            guardrail_result = await self.guardrails.screen(
                response.content, categories=categories, router=self.router, agent_name=request.agent_name,
                accounting=acct,
            )
            if guardrail_result["blocked"]:
                response.guardrail_blocked = True
                response.guardrail_categories = guardrail_result["categories"]
                response.content = BLOCKED_MESSAGE

        if request.structured_output_schema is not None:
            validation = await self._structured(request, response, acct, boundary, response.content)
            if validation["valid"]:
                response.structured_data = validation["data"]
            else:
                response.structured_output_errors = validation["errors"]

    async def _finish_generate_v2(
        self, request: GatewayRequest, response: GatewayResponse, acct: AttemptAccounting,
        boundary: ProcessingBoundary, policy_config: Dict[str, Any], policy: Dict[str, Any],
    ) -> None:
        gpolicy = parse_guardrail_policy(policy)
        enabled = policy.get("guardrails_enabled", True)
        categories = list(BASELINE_CATEGORIES) + list(policy.get("blocked_categories") or [])
        outcome = GuardrailOutcome(
            request_id=response.request_id, operation_id=acct.operation_id, build_id=request.build_id,
            agent=request.agent_name, credential_mode=boundary.credential_mode.value,
            ltier_mode=gpolicy.ltier_mode(boundary) if enabled else "off",
        )

        def _block(categories_hit: List[str], *, tier: str) -> None:
            response.guardrail_blocked = True
            response.artifact_withheld = True
            response.guardrail_categories = categories_hit
            response.content = BLOCKED_MESSAGE
            response.structured_data = None
            if tier == "dtier":
                outcome.dtier = "blocked"
                outcome.dtier_categories = categories_hit

        if not enabled:
            outcome.dtier = "disabled"
        else:
            # D-tier on the primary output first: a blocked response is never
            # sent back to the model for a repair.
            hits = _detect_blocked_content(response.content, categories)
            if hits:
                _block(hits, tier="dtier")

        final_text = response.content
        if request.structured_output_schema is not None and not response.guardrail_blocked:
            validation = await self._structured(request, response, acct, boundary, response.content)
            final_text = validation["text"]
            if enabled and validation["repaired"]:
                hits = _detect_blocked_content(final_text, categories)
                if hits:
                    _block(hits, tier="dtier")
            if not response.guardrail_blocked:
                if validation["valid"]:
                    response.structured_data = validation["data"]
                else:
                    response.structured_output_errors = validation["errors"]
        elif request.structured_output_schema is not None:
            response.structured_output_errors = ["blocked_by_guardrail"]

        if enabled and not response.guardrail_blocked and outcome.ltier_mode != "off":
            ltier = await self.guardrails.screen_artifact_ltier(
                final_text, categories=categories, router=self.router, accounting=acct,
                mode=outcome.ltier_mode, partial_coverage=gpolicy.partial_coverage, config=policy_config,
            )
            self._apply_ltier(outcome, ltier)
            if ltier.status == LTIER_BLOCKED:
                _block(ltier.categories, tier="ltier")
                if request.structured_output_schema is not None:
                    response.structured_output_errors = ["blocked_by_guardrail"]

        response.guardrail_unverified = outcome.unverified
        response.guardrail_outcome = self._publish_outcome(request, outcome)

    @staticmethod
    def _apply_ltier(outcome: GuardrailOutcome, ltier) -> None:
        outcome.ltier = ltier.status
        outcome.ltier_reason = ltier.reason
        outcome.ltier_categories = list(ltier.categories)
        outcome.ltier_calls = ltier.calls
        outcome.ltier_model = ltier.model
        if ltier.calls:
            outcome.coverage = "partial" if ltier.truncated else "full"

    # ------------------------------------------------------------------ #
    # stream
    # ------------------------------------------------------------------ #

    def _router_stream(self, request: GatewayRequest, acct: AttemptAccounting):
        return self.router.stream(
            agent_name=request.agent_name,
            messages=request.messages,
            model=request.model,
            task_complexity=request.task_complexity,
            use_retrieval=request.use_retrieval,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            tools=request.tools,
            user_id=request.user_id,
            build_id=request.build_id,
            project_id=request.project_id,
            org_id=request.org_id,
            extra_system=request.system_prompt,
            usage_out=request.usage_out,
            provider_names=request.provider_names,
            byok=request.byok,
            accounting=acct,
        )

    async def stream(self, request: GatewayRequest) -> AsyncGenerator[str, None]:
        """Real streaming with guardrails. Once a window is blocked the
        stream stops releasing text, but the underlying provider stream is
        drained so usage/audit accounting in `LLMRouter.stream` completes.

        - ``guardrail_v2`` off (rollback): ~400-character windows, each gated
          on a screen of the accumulated text (legacy), LLM step behind the
          processing boundary.
        - ``guardrail_v2`` on: each window is D-tier scanned incrementally
          (linear); released text is a *preview*. When the artifact is
          complete, at most one L-tier screen runs if policy asks for it. An
          L-tier block after previews were released raises
          ``GuardrailBlocked`` (the version is withheld); with
          ``stream_mode: buffer_until_screened`` nothing is released before
          the verdict."""
        request_id = str(uuid.uuid4())
        boundary = await self._resolve_boundary(request)
        acct = self._accounting(request, request_id, boundary)
        policy_config = await self.router.config_loader.load(agent_name=request.agent_name, org_id=request.org_id)
        policy = policy_config.get("policy") or {}
        if get_settings().guardrail_v2:
            async for chunk in self._stream_v2(request, acct, boundary, policy_config, policy, request_id):
                yield chunk
            return
        async for chunk in self._stream_legacy(request, acct, policy):
            yield chunk

    async def _stream_legacy(self, request: GatewayRequest, acct: AttemptAccounting, policy: Dict[str, Any]):
        guardrails_enabled = policy.get("guardrails_enabled", True)
        categories = list(BASELINE_CATEGORIES) + list(policy.get("blocked_categories") or [])

        accumulated = ""
        pending_chunks: List[str] = []
        pending_len = 0
        blocked = False

        async for chunk in self._router_stream(request, acct):
            if blocked:
                # Already blocked -- keep draining the generator (so the
                # router's usage/audit bookkeeping still runs to
                # completion) but stop releasing text to the caller.
                continue

            accumulated += chunk

            if not guardrails_enabled:
                yield chunk
                continue

            pending_chunks.append(chunk)
            pending_len += len(chunk)

            if pending_len >= _GUARDRAIL_WINDOW_CHARS:
                result = await self.guardrails.screen(
                    accumulated, categories=categories, router=self.router, agent_name=request.agent_name,
                    accounting=acct,
                )
                if result["blocked"]:
                    blocked = True
                    yield BLOCKED_MESSAGE
                    continue
                for pending_chunk in pending_chunks:
                    yield pending_chunk
                pending_chunks = []
                pending_len = 0

        if blocked:
            return

        if guardrails_enabled and pending_chunks:
            result = await self.guardrails.screen(
                accumulated, categories=categories, router=self.router, agent_name=request.agent_name,
                accounting=acct,
            )
            if result["blocked"]:
                yield BLOCKED_MESSAGE
                return

        for pending_chunk in pending_chunks:
            yield pending_chunk

    async def _stream_v2(
        self, request: GatewayRequest, acct: AttemptAccounting, boundary: ProcessingBoundary,
        policy_config: Dict[str, Any], policy: Dict[str, Any], request_id: str,
    ):
        settings = get_settings()
        gpolicy = parse_guardrail_policy(policy)
        enabled = policy.get("guardrails_enabled", True)
        categories = list(BASELINE_CATEGORIES) + list(policy.get("blocked_categories") or [])
        mode = gpolicy.ltier_mode(boundary) if enabled else "off"
        buffer_all = enabled and mode != "off" and gpolicy.stream_mode == "buffer_until_screened"
        window_chars = max(1, int(settings.guardrail_dtier_window_chars))
        outcome = GuardrailOutcome(
            request_id=request_id, operation_id=acct.operation_id, build_id=request.build_id,
            agent=request.agent_name, credential_mode=boundary.credential_mode.value,
            ltier_mode=mode, stream_mode=gpolicy.stream_mode if mode != "off" else "preview_after_dtier",
            dtier="passed" if enabled else "disabled",
        )
        scanner = IncrementalDTierScanner(categories)

        full: List[str] = []
        pending: List[str] = []
        held: List[str] = []
        pending_len = 0
        blocked = False

        def _dtier_block(hits: List[str]) -> None:
            outcome.dtier = "blocked"
            outcome.dtier_categories = list(hits)

        async for chunk in self._router_stream(request, acct):
            if blocked:
                continue  # drain so the router's accounting completes
            full.append(chunk)
            if not enabled:
                yield chunk
                continue
            pending.append(chunk)
            pending_len += len(chunk)
            if pending_len >= window_chars:
                hits = scanner.scan("".join(pending))
                if hits:
                    blocked = True
                    _dtier_block(hits)
                    yield BLOCKED_MESSAGE
                    continue
                if buffer_all:
                    held.extend(pending)
                else:
                    for c in pending:
                        yield c
                pending = []
                pending_len = 0

        if enabled and not blocked:
            hits = scanner.scan("".join(pending), final=True)
            if hits:
                blocked = True
                _dtier_block(hits)
                yield BLOCKED_MESSAGE
        outcome.dtier_chars_scanned = scanner.chars_scanned
        outcome.dtier_windows = scanner.windows

        if blocked:
            self._publish_outcome(request, outcome)
            return

        if enabled and mode != "off":
            ltier = await self.guardrails.screen_artifact_ltier(
                "".join(full), categories=categories, router=self.router, accounting=acct,
                mode=mode, partial_coverage=gpolicy.partial_coverage, config=policy_config,
            )
            self._apply_ltier(outcome, ltier)
            if ltier.status == LTIER_BLOCKED:
                data = self._publish_outcome(request, outcome)
                if buffer_all:
                    # Nothing was released: the caller only ever sees the
                    # block message.
                    yield BLOCKED_MESSAGE
                    return
                # Previews were released: withdraw the version (GR-6).
                raise GuardrailBlocked(ltier.categories, data)

        self._publish_outcome(request, outcome)
        for c in held:
            yield c
        for c in pending:
            yield c

    # ------------------------------------------------------------------ #

    def estimate_tokens(self, messages: List[Dict[str, Any]], *, provider: str, model: str, max_output_tokens: Optional[int] = None):
        return self.optimizer.estimate_tokens(messages, provider=provider, model=model, max_output_tokens=max_output_tokens)

    def estimate_cost(self, token_estimate: Any) -> Any:
        return self.optimizer.estimate_cost(token_estimate)

    async def validate_output(
        self,
        text: str,
        schema: Dict[str, Any],
        *,
        repair_fn: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Validate `text` as JSON against `schema`. On failure, if
        `repair_fn` is given (an async callable taking the original text,
        the schema, and the validation errors, returning corrected text) it
        gets exactly one repair attempt before giving up."""
        import jsonschema

        def _try_validate(candidate: str) -> Dict[str, Any]:
            cleaned = strip_markdown_fences(candidate)
            try:
                parsed = json.loads(cleaned)
            except json.JSONDecodeError as exc:
                return {"valid": False, "errors": [f"invalid JSON: {exc}"]}
            try:
                jsonschema.validate(parsed, schema)
            except jsonschema.ValidationError as exc:
                return {"valid": False, "errors": [exc.message]}
            return {"valid": True, "data": parsed}

        result = _try_validate(text)
        if result["valid"] or repair_fn is None:
            return result

        repaired_text = await repair_fn(text, schema, result["errors"])
        repaired_result = _try_validate(repaired_text)
        if repaired_result["valid"]:
            return repaired_result
        return {"valid": False, "errors": repaired_result["errors"]}

    def list_providers(self) -> List[Dict[str, Any]]:
        return self.router.registry.list_providers()

    async def provider_health(self) -> List[Dict[str, Any]]:
        return await self.router.health_check_all()


_gateway: Optional[AIGateway] = None


def get_ai_gateway() -> AIGateway:
    global _gateway
    if _gateway is None:
        _gateway = AIGateway()
    return _gateway
