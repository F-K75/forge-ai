"""Base agent with full prompt engineering, context engineering, and
harness integration.

Every agent inherits:
- Prompt engineering: version tracking, few-shot example injection, composition
- Context engineering: semantic retrieval, relevance scoring, token-budgeted
  context windows
- Harness: post-run evaluation and quality metrics collection (opt-in)
"""

from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, Optional
import asyncio
import logging
import time

from core.config import get_settings
from core.models import AgentType, PlanTier, WSEvent, WSEventType
from core.ai_usage import check_budget
from core.database import get_db
from core.encryption import decrypt_field
from gateway import GatewayRequest, get_ai_gateway
from prompt_builder import PromptContext, ProjectStateSlice, get_prompt_builder
from prompt_builder.registry import get_template_registry

# New engineering modules
from prompt_engineer import VersionManager, PromptChangeType, FewShotManager
from context_engineer import ContextAssembler, AssemblyPlan

settings = get_settings()
logger = logging.getLogger(__name__)


async def _resolve_byok(user_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Pro+ users can store their own provider key (Settings -> BYOK) to run
    builds on their own account instead of Forge's; core/orchestrator.py
    skips per-agent credit deduction for these builds, so the LLM call here
    must actually use the user's key -- otherwise Forge eats the API cost
    while charging the user nothing. Returns None for everyone else, which
    is the overwhelmingly common case, so this stays a cheap single lookup.
    """
    if not user_id:
        return None
    try:
        db = await get_db()
        user_doc = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "plan": 1, "llm_api_key": 1, "llm_provider": 1, "llm_base_url": 1, "llm_model": 1},
        )
    except Exception:
        return None

    encrypted_key = (user_doc or {}).get("llm_api_key")
    if not encrypted_key:
        return None
    if (user_doc or {}).get("plan") not in (PlanTier.PRO.value, PlanTier.ENTERPRISE.value):
        return None

    key = decrypt_field(encrypted_key)
    if not key:
        return None

    provider = user_doc.get("llm_provider") or "anthropic"
    if provider == "openai_compatible":
        base_url = user_doc.get("llm_base_url")
        model = user_doc.get("llm_model")
        if not base_url or not model:
            return None
        # SSRF guard: a user-controlled base URL is the endpoint our HTTP
        # client connects to, so it must not resolve to an internal/private
        # address or the cloud metadata service. Validated again at write
        # time in PUT /auth/me, but this is the live request path so we
        # must not trust stored state blindly.
        from core.security import validate_byok_base_url

        valid, error = await validate_byok_base_url(base_url)
        if not valid:
            logger.warning("Rejecting BYOK base_url for user %s: %s", user_id, error)
            return None
        return {"provider": "openai_compatible", "api_key": key, "base_url": base_url, "model": model}

    return {"provider": "anthropic", "api_key": key}


class CircuitBreaker:
    """Simple circuit breaker for LLM API calls."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = "closed"  # closed, open, half_open

    def can_call(self) -> bool:
        if self.state == "closed":
            return True
        if self.state == "open":
            if self.last_failure_time and (time.monotonic() - self.last_failure_time > self.recovery_timeout):
                self.state = "half_open"
                return True
            return False
        return True

    def record_success(self):
        self.failure_count = 0
        self.state = "closed"

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.monotonic()
        if self.failure_count >= self.failure_threshold:
            self.state = "open"

    def retry_after(self) -> int:
        """Seconds until the circuit breaker may half-open."""
        if self.state != "open" or self.last_failure_time is None:
            return 0
        elapsed = time.monotonic() - self.last_failure_time
        remaining = self.recovery_timeout - int(elapsed)
        return max(0, remaining)


_llm_circuit_breaker = CircuitBreaker()


# Shared service instances for the new engineering modules.
# Lazily initialised so agents that don't use them pay no import cost.
_version_manager: Optional[VersionManager] = None
_few_shot_manager: Optional[FewShotManager] = None
_context_assembler: Optional[ContextAssembler] = None


def _get_version_manager() -> VersionManager:
    global _version_manager
    if _version_manager is None:
        _version_manager = VersionManager()
    return _version_manager


def _get_few_shot_manager() -> FewShotManager:
    global _few_shot_manager
    if _few_shot_manager is None:
        _few_shot_manager = FewShotManager()
    return _few_shot_manager


def _get_context_assembler() -> ContextAssembler:
    global _context_assembler
    if _context_assembler is None:
        _context_assembler = ContextAssembler()
    return _context_assembler


class BaseAgent:
    """Agent base class with full prompt/context/harness engineering support.

    Core flow::

        context_assembler.assemble()            # context engineering
            -> prompt_builder.build(context)    # prompt engineering pipeline
                -> version_manager.record()     # version tracking
                    -> few_shot_manager         # few-shot injection
                        -> LLM call             # via gateway
    """

    agent_type: AgentType
    system_prompt: str = ""
    # Optional: (role, version) key into the Prompt Builder's template
    # registry. When set, the agent's system prompt is generated dynamically
    # per call instead of using the hardcoded `system_prompt` string above.
    prompt_role: Optional[str] = None
    prompt_template_version: str = "v1"

    # Context engineering: set to False to skip context assembly for roles
    # that don't need it (e.g. simple chat agents)
    use_context_engineering: bool = True

    def __init__(self):
        self.gateway = get_ai_gateway()
        self.model = settings.default_model
        self.version_manager = _get_version_manager()
        self.few_shot_manager = _get_few_shot_manager()
        self.context_assembler = _get_context_assembler()

    def _resolve_system_prompt(
        self,
        messages: list,
        extra_system: str,
        prompt_template_version: Optional[str] = None,
        project_state: Optional[ProjectStateSlice] = None,
        previous_outputs: Optional[Dict[str, str]] = None,
    ) -> str:
        """Build the system prompt using the full engineering pipeline.

        1. Context engineering: assemble context from project state, files,
           knowledge base, previous outputs (when available).
        2. Prompt engineering: render the template with assembled context.
        3. Version tracking: record the prompt version for traceability.
        4. Few-shot injection: append relevant few-shot examples.
        """
        if not self.prompt_role:
            return self.system_prompt + (f"\n\n{extra_system}" if extra_system else "")

        # Extract task from the last user message
        task = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                task = m.get("content", "")
                break

        # --- Context Engineering ---
        if self.use_context_engineering:
            # Assemble a full context from multiple sources
            ctx = self._assemble_context(task, extra_system, project_state, previous_outputs)
        else:
            # Minimal legacy path
            ctx = PromptContext(
                agent_role=self.prompt_role,
                task=task,
                template_version=prompt_template_version or self.prompt_template_version,
                user_request=extra_system,
                project_state=project_state or ProjectStateSlice(),
                previous_outputs=previous_outputs or {},
            )

        # --- Prompt Engineering ---
        result = get_prompt_builder().build(ctx)

        # --- Version Tracking ---
        try:
            template = get_template_registry().get(
                self.prompt_role,
                prompt_template_version or self.prompt_template_version,
            )
            self.version_manager.record(
                template,
                PromptChangeType.SECTION_MODIFIED,
                change_reason=f"Agent call for task: {task[:80]}",
            )
        except Exception:
            pass  # Version recording is best-effort

        # --- Few-Shot Injection ---
        few_shot_text = self.few_shot_manager.format_examples(
            self.few_shot_manager.select(
                role=self.prompt_role,
                task=task,
                strategy="semantic",
                max_examples=3,
            )
        )
        if few_shot_text:
            result.prompt += f"\n\n{few_shot_text}"

        return result.prompt

    async def _assemble_context(
        self,
        task: str,
        user_request: str,
        project_state: Optional[ProjectStateSlice],
        previous_outputs: Optional[Dict[str, str]],
    ) -> PromptContext:
        """Use the context assembler to build a rich PromptContext."""
        plan = AssemblyPlan(
            plan_id=f"{self.prompt_role}-{self.prompt_template_version}",
            role=self.prompt_role or "unknown",
            include_file_contents=True,
            max_files=10,
        )
        ctx = await self.context_assembler.assemble(
            role=self.prompt_role or "unknown",
            task=task,
            plan=plan,
            user_request=user_request,
            previous_outputs=previous_outputs or {},
            extra_state=project_state,
        )
        return ctx

    async def _call_llm(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
        user_id: Optional[str] = None,
        build_id: Optional[str] = None,
        project_id: Optional[str] = None,
        org_id: Optional[str] = None,
        prompt_template_version: Optional[str] = None,
        project_state: Optional[ProjectStateSlice] = None,
        previous_outputs: Optional[Dict[str, str]] = None,
    ) -> str:
        if not _llm_circuit_breaker.can_call():
            retry_after = _llm_circuit_breaker.retry_after()
            from core.llm.provider import CircuitBreakerOpen
            raise CircuitBreakerOpen(retry_after=retry_after)

        byok = await _resolve_byok(user_id)
        if user_id and not byok:
            await check_budget(user_id, org_id=org_id)

        try:
            request = GatewayRequest(
                agent_name=self.__class__.__name__.lower(),
                messages=messages,
                model=None,
                max_tokens=max_tokens,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
                system_prompt=self._resolve_system_prompt(
                    messages,
                    extra_system,
                    prompt_template_version,
                    project_state=project_state,
                    previous_outputs=previous_outputs,
                ),
                byok=byok,
            )
            response = await self.gateway.generate(request)
            _llm_circuit_breaker.record_success()
            return response.content
        except Exception:
            _llm_circuit_breaker.record_failure()
            raise

    async def stream(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
        user_id: Optional[str] = None,
        build_id: Optional[str] = None,
        project_id: Optional[str] = None,
        org_id: Optional[str] = None,
        usage_out: Optional[dict] = None,
        prompt_template_version: Optional[str] = None,
        project_state: Optional[ProjectStateSlice] = None,
        previous_outputs: Optional[Dict[str, str]] = None,
    ) -> AsyncGenerator[str, None]:
        if not _llm_circuit_breaker.can_call():
            retry_after = _llm_circuit_breaker.retry_after()
            from core.llm.provider import CircuitBreakerOpen
            raise CircuitBreakerOpen(retry_after=retry_after)

        byok = await _resolve_byok(user_id)
        if user_id and not byok:
            await check_budget(user_id, org_id=org_id)

        try:
            request = GatewayRequest(
                agent_name=self.__class__.__name__.lower(),
                messages=messages,
                model=None,
                max_tokens=max_tokens,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
                system_prompt=self._resolve_system_prompt(
                    messages,
                    extra_system,
                    prompt_template_version,
                    project_state=project_state,
                    previous_outputs=previous_outputs,
                ),
                byok=byok,
                usage_out=usage_out,
                streaming=True,
            )
            async for chunk in self.gateway.stream(request):
                yield chunk
            _llm_circuit_breaker.record_success()
        except Exception:
            _llm_circuit_breaker.record_failure()
            raise

    async def run(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
        user_id: Optional[str] = None,
        build_id: Optional[str] = None,
        project_id: Optional[str] = None,
        org_id: Optional[str] = None,
        usage_out: Optional[dict] = None,
        prompt_template_version: Optional[str] = None,
        project_state: Optional[ProjectStateSlice] = None,
        previous_outputs: Optional[Dict[str, str]] = None,
    ) -> str:
        chunks: list[str] = []
        async for chunk in self.stream(
            messages,
            extra_system,
            max_tokens,
            user_id,
            build_id,
            project_id,
            org_id,
            usage_out=usage_out,
            prompt_template_version=prompt_template_version,
            project_state=project_state,
            previous_outputs=previous_outputs,
        ):
            chunks.append(chunk)
        return "".join(chunks)

    def build_event(self, build_id: str, event_type: WSEventType, data: dict) -> WSEvent:
        return WSEvent(type=event_type, build_id=build_id, data=data)