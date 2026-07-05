from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional


class ProviderError(RuntimeError):
    """Raised when a provider fails to satisfy a request."""


@dataclass
class CompletionResponse:
    text: str
    provider: str
    model: str
    usage: Dict[str, int] = field(default_factory=dict)
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
