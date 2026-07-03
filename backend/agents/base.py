from typing import AsyncGenerator, Optional
import re
import anthropic
from core.config import get_settings
from core.models import AgentType, WSEvent, WSEventType
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


class BaseAgent:
    agent_type: AgentType
    system_prompt: str

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.anthropic_timeout,
        )
        self.model = settings.default_model

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

        if user_id:
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
            async with self.client.messages.stream(
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
    ) -> AsyncGenerator[str, None]:
        if not _llm_circuit_breaker.can_call():
            raise RuntimeError("LLM circuit breaker is open - service temporarily unavailable")

        if user_id:
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

        try:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=sanitized_messages,
            ) as stream:
                async for text in stream.text_stream:
                    full_response += text
                    yield text
            _llm_circuit_breaker.record_success()

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

    async def run(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
        user_id: Optional[str] = None,
        build_id: Optional[str] = None,
        project_id: Optional[str] = None,
        org_id: Optional[str] = None,
    ) -> str:
        chunks = []
        async for chunk in self.stream(messages, extra_system, max_tokens, user_id, build_id, project_id, org_id):
            chunks.append(chunk)
        return "".join(chunks)

    def build_event(self, build_id: str, event_type: WSEventType, data: dict) -> WSEvent:
        return WSEvent(type=event_type, build_id=build_id, data=data)
