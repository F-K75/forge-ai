from typing import AsyncGenerator, NamedTuple, Optional
import re
import anthropic
import openai
from core.config import get_settings
from core.models import AgentType, WSEvent, WSEventType, PlanTier
from core.database import get_db
from core.encryption import decrypt_field
from core.ai_usage import track_usage, calculate_cost, check_budget
from core.security import sanitize_prompt
import asyncio
import logging

settings = get_settings()
logger = logging.getLogger(__name__)


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
            if self.last_failure_time and (asyncio.get_event_loop().time() - self.last_failure_time > self.recovery_timeout):
                self.state = "half_open"
                return True
            return False
        return True
    
    def record_success(self):
        self.failure_count = 0
        self.state = "closed"
    
    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = asyncio.get_event_loop().time()
        if self.failure_count >= self.failure_threshold:
            self.state = "open"


_llm_circuit_breaker = CircuitBreaker()


PROMPT_INJECTION_PATTERNS = [
    "ignore previous instructions",
    "ignore all previous",
    "forget everything",
    "forget the above",
    "disregard",
    "override",
    "new instructions",
    "your new role",
    "you are now",
    "from now on",
    "pretend you are",
    "act as if",
    "roleplay as",
    "role play as",
    "system prompt",
    "reveal your",
    "show your",
    "output your",
    "print your",
    "repeat the words",
    "repeat everything",
]


def _detect_prompt_injection(prompt: str) -> bool:
    # Collapse runs of whitespace/hyphens/underscores to a single space so
    # trivial reformatting ("ignore  previous instructions", "ignore-previous-
    # instructions", "ignore\nprevious\ninstructions") can't slip past an
    # exact-substring match on the canonical phrase.
    normalized = re.sub(r"[\s_-]+", " ", prompt.lower())
    return any(pattern in normalized for pattern in PROMPT_INJECTION_PATTERNS)


def _any_message_has_prompt_injection(messages: list) -> bool:
    # Check every user turn, not just the latest one — conversation_history
    # (earlier turns of an iterative build) is fully user-controlled and
    # reaches the LLM the same as the current message, so an injection
    # planted in an earlier turn is just as live as one in the last message.
    return any(
        _detect_prompt_injection(m.get("content", ""))
        for m in messages
        if m.get("role") == "user" and isinstance(m.get("content"), str)
    )


class ResolvedLLM(NamedTuple):
    """What a call should actually hit: Forge's own Anthropic key, a user's
    BYOK Anthropic key, or a user's BYOK key for any OpenAI-compatible
    endpoint (Groq, OpenRouter, local Ollama, etc.). `client` is either an
    anthropic.AsyncAnthropic or an openai.AsyncOpenAI depending on `provider`.
    """
    provider: str  # "anthropic" | "openai_compatible"
    client: object
    model: str


class BaseAgent:
    agent_type: AgentType
    system_prompt: str

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.anthropic_timeout,
        )
        self.model = settings.default_model

    async def _resolve_client(
        self, user_id: Optional[str]
    ) -> tuple[ResolvedLLM, bool]:
        """Returns (resolved, is_byok) for this call.

        Agent instances (self) are module-level singletons shared across every
        concurrent build for every user (see api/builds.py's `orchestrator =
        Orchestrator()`) — this must never mutate `self.client`, or one user's
        key could leak into another user's in-flight build. A fresh client is
        built per call instead, falling back to the shared server client.
        """
        default = ResolvedLLM(provider="anthropic", client=self.client, model=self.model)
        if not user_id:
            return default, False
        try:
            db = await get_db()
            user_doc = await db.users.find_one(
                {"id": user_id},
                {"_id": 0, "plan": 1, "llm_api_key": 1, "llm_provider": 1, "llm_base_url": 1, "llm_model": 1},
            )
        except Exception:
            return default, False

        encrypted_key = user_doc.get("llm_api_key") if user_doc else None
        if not encrypted_key:
            return default, False
        if (user_doc or {}).get("plan") not in (PlanTier.PRO.value, PlanTier.ENTERPRISE.value):
            return default, False

        key = decrypt_field(encrypted_key)
        if not key:
            return default, False

        provider = user_doc.get("llm_provider") or "anthropic"
        if provider == "openai_compatible":
            base_url = user_doc.get("llm_base_url")
            model = user_doc.get("llm_model")
            if not base_url or not model:
                return default, False
            client = openai.AsyncOpenAI(api_key=key, base_url=base_url, timeout=settings.anthropic_timeout)
            return ResolvedLLM(provider="openai_compatible", client=client, model=model), True

        client = anthropic.AsyncAnthropic(api_key=key, timeout=settings.anthropic_timeout)
        return ResolvedLLM(provider="anthropic", client=client, model=self.model), True

    async def _call_llm(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
        user_id: Optional[str] = None,
        build_id: Optional[str] = None,
        project_id: Optional[str] = None,
        org_id: Optional[str] = None,
    ) -> str:
        if not _llm_circuit_breaker.can_call():
            raise RuntimeError("LLM circuit breaker is open - service temporarily unavailable")

        client, is_byok = await self._resolve_client(user_id)
        if user_id and not is_byok:
            await check_budget(user_id, org_id=org_id)

        # Sanitize user messages
        sanitized_messages = []
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    content = sanitize_prompt(content)
                msg = {**msg, "content": content}
            sanitized_messages.append(msg)

        system = self.system_prompt
        if extra_system:
            system += f"\n\n{extra_system}"

        # Prompt injection detection across every user turn (see
        # _any_message_has_prompt_injection — checking only the last message
        # missed anything planted earlier in conversation_history).
        if _any_message_has_prompt_injection(sanitized_messages):
            raise ValueError("Potential prompt injection detected in user input")

        full_response = ""
        prompt_tokens = 0
        completion_tokens = 0

        try:
            async with client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=sanitized_messages,
            ) as stream:
                async for text in stream.text_stream:
                    full_response += text
            _llm_circuit_breaker.record_success()

            # Track token usage
            cached_tokens = 0
            if hasattr(stream, "response") and hasattr(stream.response, "usage"):
                usage = stream.response.usage
                prompt_tokens = getattr(usage, "input_tokens", 0) or 0
                completion_tokens = getattr(usage, "output_tokens", 0) or 0
                cached_tokens = getattr(usage, "cache_read_input_tokens", 0) or 0

            if user_id and (prompt_tokens + completion_tokens > 0):
                try:
                    cost_usd = calculate_cost(
                        self.model, prompt_tokens, completion_tokens, cached_tokens=cached_tokens
                    )
                    await track_usage(
                        user_id=user_id,
                        build_id=build_id,
                        model=self.model,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        cost_usd=cost_usd,
                        org_id=org_id,
                        project_id=project_id,
                        cached_tokens=cached_tokens,
                        agent=self.__class__.__name__,
                    )
                except Exception:
                    logger.exception("Failed to track LLM usage")
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
    ) -> AsyncGenerator[str, None]:
        if not _llm_circuit_breaker.can_call():
            raise RuntimeError("LLM circuit breaker is open - service temporarily unavailable")

        resolved, is_byok = await self._resolve_client(user_id)
        if user_id and not is_byok:
            await check_budget(user_id, org_id=org_id)

        sanitized_messages = []
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    content = sanitize_prompt(content)
                msg = {**msg, "content": content}
            sanitized_messages.append(msg)

        system = self.system_prompt
        if extra_system:
            system += f"\n\n{extra_system}"

        if _any_message_has_prompt_injection(sanitized_messages):
            raise ValueError("Potential prompt injection detected in user input")

        full_response = ""
        prompt_tokens = 0
        completion_tokens = 0
        cached_tokens = 0

        try:
            if resolved.provider == "anthropic":
                async with resolved.client.messages.stream(
                    model=resolved.model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=sanitized_messages,
                ) as stream:
                    async for text in stream.text_stream:
                        full_response += text
                        yield text

                if hasattr(stream, "response") and hasattr(stream.response, "usage"):
                    usage = stream.response.usage
                    prompt_tokens = getattr(usage, "input_tokens", 0) or 0
                    completion_tokens = getattr(usage, "output_tokens", 0) or 0
                    cached_tokens = getattr(usage, "cache_read_input_tokens", 0) or 0
            else:
                # openai_compatible BYOK (Groq, OpenRouter, local Ollama, etc.)
                # -- these providers' usage-on-stream support is inconsistent,
                # so token/cost tracking is best-effort: prompt/completion
                # tokens simply stay 0 (and tracking is skipped below) if a
                # given provider doesn't report it.
                oa_stream = await resolved.client.chat.completions.create(
                    model=resolved.model,
                    max_tokens=max_tokens,
                    messages=[{"role": "system", "content": system}, *sanitized_messages],
                    stream=True,
                )
                async for chunk in oa_stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta.content
                    if delta:
                        full_response += delta
                        yield delta

            _llm_circuit_breaker.record_success()

            # Computed whenever there's any usage to report, not just when
            # user_id is set -- usage_out callers (e.g. per-task cost/token
            # tracking, see agents/task_executor.py) want the number even if
            # they track it somewhere other than the shared ai_usage ledger.
            cost_usd = 0.0
            if prompt_tokens + completion_tokens > 0:
                cost_usd = calculate_cost(
                    resolved.model, prompt_tokens, completion_tokens, cached_tokens=cached_tokens
                )

            if user_id and (prompt_tokens + completion_tokens > 0):
                try:
                    await track_usage(
                        user_id=user_id,
                        build_id=build_id,
                        model=resolved.model,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        cost_usd=cost_usd,
                        org_id=org_id,
                        project_id=project_id,
                        cached_tokens=cached_tokens,
                        agent=self.__class__.__name__,
                    )
                except Exception:
                    logger.exception("Failed to track LLM usage")

            if usage_out is not None:
                usage_out["model"] = resolved.model
                usage_out["prompt_tokens"] = prompt_tokens
                usage_out["completion_tokens"] = completion_tokens
                usage_out["cached_tokens"] = cached_tokens
                usage_out["total_tokens"] = prompt_tokens + completion_tokens
                usage_out["cost_usd"] = cost_usd

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
    ) -> str:
        chunks = []
        async for chunk in self.stream(
            messages, extra_system, max_tokens, user_id, build_id, project_id, org_id, usage_out=usage_out
        ):
            chunks.append(chunk)
        return "".join(chunks)

    def build_event(self, build_id: str, event_type: WSEventType, data: dict) -> WSEvent:
        return WSEvent(type=event_type, build_id=build_id, data=data)
