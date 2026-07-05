from typing import AsyncGenerator, Optional
import asyncio
import logging

from core.config import get_settings
from core.models import AgentType, WSEvent, WSEventType
from core.ai_usage import check_budget
from core.llm.router import get_llm_router

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


class BaseAgent:
    agent_type: AgentType
    system_prompt: str

    def __init__(self):
        self.router = get_llm_router()
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

        try:
            response = await self.router.generate(
                agent_name=self.__class__.__name__.lower(),
                messages=messages,
                # Pass None (not self.model) so a per-agent config override
                # in llm.yaml can take effect; self.model is only a
                # last-resort default the router applies if no override and
                # no provider default_model exists.
                model=None,
                max_tokens=max_tokens,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
                extra_system=self.system_prompt + (f"\n\n{extra_system}" if extra_system else ""),
            )
            _llm_circuit_breaker.record_success()
            return response.text
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

        if user_id:
            await check_budget(user_id, org_id=org_id)

        try:
            response = await self.router.generate(
                agent_name=self.__class__.__name__.lower(),
                messages=messages,
                # Pass None (not self.model) so a per-agent config override
                # in llm.yaml can take effect; self.model is only a
                # last-resort default the router applies if no override and
                # no provider default_model exists.
                model=None,
                max_tokens=max_tokens,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
                extra_system=self.system_prompt + (f"\n\n{extra_system}" if extra_system else ""),
                usage_out=usage_out,
            )
            _llm_circuit_breaker.record_success()
            for token in response.text:
                yield token
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
