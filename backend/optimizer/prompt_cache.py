from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

from core.database import cache_get_json, cache_set_json


def _hash_messages(messages: List[Dict[str, Any]], model: str) -> str:
    payload = json.dumps({"messages": messages, "model": model}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class PromptCache:
    """Redis-backed cache of already-optimized prompts, keyed by a hash of
    the pre-optimization messages+model. Saves re-running context/prompt
    optimization for identical inputs (common with retries and repeated
    build steps) -- not the LLM response itself, see ResponseCache for that."""

    key_prefix = "optimizer:prompt"

    def __init__(self, *, ttl_seconds: int = 3600):
        self.ttl_seconds = ttl_seconds
        self.hits = 0
        self.misses = 0

    def _key(self, messages: List[Dict[str, Any]], model: str) -> str:
        return f"{self.key_prefix}:{_hash_messages(messages, model)}"

    async def get(self, messages: List[Dict[str, Any]], model: str) -> Optional[Dict[str, Any]]:
        cached = await cache_get_json(self._key(messages, model))
        if cached is not None:
            self.hits += 1
        else:
            self.misses += 1
        return cached

    async def set(self, messages: List[Dict[str, Any]], model: str, optimized: Dict[str, Any]) -> None:
        await cache_set_json(self._key(messages, model), optimized, ttl=self.ttl_seconds)

    def stats(self) -> Dict[str, int]:
        return {"hits": self.hits, "misses": self.misses}
