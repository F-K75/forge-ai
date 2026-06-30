from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional
import anthropic
from core.config import get_settings
from core.models import AgentType, WSEvent, WSEventType
import json
import asyncio

settings = get_settings()


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


# Global circuit breaker for LLM calls
_llm_circuit_breaker = CircuitBreaker()


class BaseAgent(ABC):
    agent_type: AgentType
    system_prompt: str

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.anthropic_timeout,
        )
        self.model = settings.default_model

    async def stream(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
    ) -> AsyncGenerator[str, None]:
        if not _llm_circuit_breaker.can_call():
            raise RuntimeError("LLM circuit breaker is open - service temporarily unavailable")
        
        system = self.system_prompt
        if extra_system:
            system += f"\n\n{extra_system}"

        try:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
            _llm_circuit_breaker.record_success()
        except Exception as e:
            _llm_circuit_breaker.record_failure()
            raise

    async def run(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
    ) -> str:
        full_response = ""
        async for chunk in self.stream(messages, extra_system, max_tokens):
            full_response += chunk
        return full_response

    def build_event(self, build_id: str, event_type: WSEventType, data: dict) -> WSEvent:
        return WSEvent(type=event_type, build_id=build_id, data=data)
