from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

from core.database import cache_get_json, cache_set_json


def _hash_request(messages: List[Dict[str, Any]], model: str, provider: str) -> str:
    payload = json.dumps({"messages": messages, "model": model, "provider": provider}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class ResponseCache:
    """Redis-backed exact-match cache for deterministic LLM responses.

    Never cache: streaming responses, randomized/sampled outputs (temperature
    > 0 without a fixed seed), tool-calling workflows, or requests explicitly
    marked non-cacheable -- callers must set `cacheable=False` for those and
    this class will refuse to read or write."""

    key_prefix = "optimizer:response"

    def __init__(self, *, ttl_seconds: int = 600):
        self.ttl_seconds = ttl_seconds
        self.hits = 0
        self.misses = 0

    @staticmethod
    def is_cacheable(*, streaming: bool, has_tools: bool, temperature: float = 0.0, cacheable: bool = True) -> bool:
        if not cacheable:
            return False
        if streaming or has_tools:
            return False
        if temperature and temperature > 0:
            return False
        return True

    def _key(self, messages: List[Dict[str, Any]], model: str, provider: str) -> str:
        return f"{self.key_prefix}:{_hash_request(messages, model, provider)}"

    async def get(self, messages: List[Dict[str, Any]], model: str, provider: str) -> Optional[Dict[str, Any]]:
        cached = await cache_get_json(self._key(messages, model, provider))
        if cached is not None:
            self.hits += 1
        else:
            self.misses += 1
        return cached

    async def set(self, messages: List[Dict[str, Any]], model: str, provider: str, response: Dict[str, Any]) -> None:
        await cache_set_json(self._key(messages, model, provider), response, ttl=self.ttl_seconds)

    def stats(self) -> Dict[str, int]:
        return {"hits": self.hits, "misses": self.misses}
