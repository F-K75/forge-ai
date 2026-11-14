from __future__ import annotations

import json
import time
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

from agents.json_utils import strip_markdown_fences
from core.llm.provider import CompletionResponse
from core.llm.router import LLMRouter, get_llm_router
from core.metrics import (
    llm_failovers_total,
    llm_guardrail_blocked_total,
    llm_request_duration_seconds,
    llm_requests_total,
    llm_retry_attempts_total,
)
from gateway.audit import AuditLogger, get_audit_logger
from gateway.guardrails import BASELINE_CATEGORIES, GuardrailsEngine, get_guardrails_engine
from gateway.models import GatewayRequest, GatewayResponse
from optimizer.service import AIOptimizer, get_optimizer

# Windowed guardrail screening for AIGateway.stream(): rather than
# buffering the entire response before screening (no time-to-first-token)
# or screening nothing at all (no coverage), text is released to the
# caller in windows -- each window's release is gated on a guardrails
# screen of the *accumulated* text so far (for context), not just the new
# increment. This bounds worst-case latency to one window instead of the
# full response, at the cost of one extra guardrails screen per window.
_GUARDRAIL_WINDOW_CHARS = 400


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

    async def generate(self, request: GatewayRequest) -> GatewayResponse:
        request_id = str(uuid.uuid4())
        attempt_info: Dict[str, int] = {}
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
        if policy.get("guardrails_enabled", True):
            categories = list(BASELINE_CATEGORIES) + list(policy.get("blocked_categories") or [])
            guardrail_result = await self.guardrails.screen(
                response.content, categories=categories, router=self.router, agent_name=request.agent_name,
            )
            if guardrail_result["blocked"]:
                response.guardrail_blocked = True
                response.guardrail_categories = guardrail_result["categories"]
                response.content = "This response was blocked by content safety guardrails."

        if request.structured_output_schema is not None:

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
                )
                return repair_completion.text

            validation = await self.validate_output(
                response.content, request.structured_output_schema, repair_fn=_repair
            )
            if validation["valid"]:
                response.structured_data = validation["data"]
            else:
                response.structured_output_errors = validation["errors"]

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

        await self.audit_logger.record(
            request_id=request_id,
            provider=response.provider,
            model=response.model,
            agent_name=request.agent_name,
            retry_attempts=attempt_info.get("attempts", 0),
            failovers=attempt_info.get("failovers", 0),
            policy_decisions=(
                [{"decision": "guardrail_blocked", "categories": response.guardrail_categories}]
                if response.guardrail_blocked
                else None
            ),
        )
        return response

    async def stream(self, request: GatewayRequest) -> AsyncGenerator[str, None]:
        """Real, windowed streaming: chunks are released to the caller in
        ~`_GUARDRAIL_WINDOW_CHARS`-sized windows, each gated on a guardrails
        screen of the accumulated text so far, instead of buffering the
        entire response before yielding anything. Once a window is blocked,
        the stream stops (no further partial output is released) but the
        underlying provider stream is drained so usage/audit accounting in
        `LLMRouter.stream` still completes normally."""
        policy_config = await self.router.config_loader.load(agent_name=request.agent_name, org_id=request.org_id)
        policy = policy_config.get("policy") or {}
        guardrails_enabled = policy.get("guardrails_enabled", True)
        categories = list(BASELINE_CATEGORIES) + list(policy.get("blocked_categories") or [])

        accumulated = ""
        pending_chunks: List[str] = []
        pending_len = 0
        blocked = False

        async for chunk in self.router.stream(
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
        ):
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
                )
                if result["blocked"]:
                    blocked = True
                    yield "This response was blocked by content safety guardrails."
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
            )
            if result["blocked"]:
                yield "This response was blocked by content safety guardrails."
                return

        for pending_chunk in pending_chunks:
            yield pending_chunk

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
