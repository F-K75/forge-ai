from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional


class ProviderError(RuntimeError):
    """Raised when a provider fails to satisfy a request."""


class CircuitBreakerOpen(RuntimeError):
    """Raised when the LLM circuit breaker is in the open state.

    Carries ``retry_after`` (seconds until the breaker may half-open) so
    callers can surface a ``Retry-After`` header or estimated wait time
    to the user instead of a raw stack trace.
    """

    def __init__(self, message: str = "LLM service is temporarily unavailable", *, retry_after: int = 60):
        super().__init__(message)
        self.retry_after = retry_after


@dataclass
class CompletionResponse:
    text: str
    provider: str
    model: str
    usage: Dict[str, int] = field(default_factory=dict)
    finish_reason: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    raw: Optional[Any] = None


class BaseProviderAdapter(ABC):
    """Small adapter contract for LLM providers."""

    name: str = "base"
    default_model: str = "gpt-4o-mini"
    supports_stream: bool = True

    def __init__(self, *, api_key: Optional[str] = None, base_url: Optional[str] = None, timeout: int = 60):
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout

    async def health_check(self) -> bool:
        return True

    async def count_tokens(self, *, text: str, **kwargs: Any) -> int:
        return max(1, len(text.split()))

    @abstractmethod
    async def chat_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> CompletionResponse:
        raise NotImplementedError

    @abstractmethod
    async def stream_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> AsyncIterator[str]:
        raise NotImplementedError

    async def get_models(self) -> List[str]:
        return [self.default_model]
