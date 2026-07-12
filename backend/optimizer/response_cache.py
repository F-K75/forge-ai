from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any, Dict, List, Optional, Tuple

from core.database import cache_get_json, cache_set_json


def _scope_key(org_id: Optional[str], project_id: Optional[str]) -> str:
    """Tenant/project scoping component for cache keys. Requests with no
    org_id/project_id (e.g. unauthenticated or system-level calls) fall
    into their own shared "unscoped" bucket rather than colliding with any
    tenant's data."""
    return f"{org_id or '-'}:{project_id or '-'}"


def _hash_request(
    messages: List[Dict[str, Any]], model: str, provider: str, org_id: Optional[str], project_id: Optional[str]
) -> str:
    payload = json.dumps(
        {
            "messages": messages,
            "model": model,
            "provider": provider,
            "scope": _scope_key(org_id, project_id),
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _fingerprint(messages: List[Dict[str, Any]]) -> Dict[str, int]:
    """Bag-of-words term-frequency vector over the concatenated message
    text. Deliberately not a real embedding -- no embedding model is wired
    up yet (that lands with semantic retrieval/RAG) -- but is enough to
    catch near-duplicate prompts (rephrased wording, minor edits) that the
    exact-match cache above misses entirely."""
    text = " ".join(
        str(m.get("content", "")) for m in messages if isinstance(m.get("content"), str)
    ).lower()
    freq: Dict[str, int] = {}
    for token in _TOKEN_RE.findall(text):
        freq[token] = freq.get(token, 0) + 1
    return freq


def _cosine(a: Dict[str, int], b: Dict[str, int]) -> float:
    if not a or not b:
        return 0.0
    shared = set(a) & set(b)
    dot = sum(a[t] * b[t] for t in shared)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class ResponseCache:
    """Redis-backed cache for deterministic LLM responses: exact-match by
    default, with an optional semantic-similarity fallback for near-duplicate
    prompts that hash differently but mean the same thing.

    Never cache: streaming responses, randomized/sampled outputs (temperature
    > 0 without a fixed seed), tool-calling workflows, or requests explicitly
    marked non-cacheable -- callers must set `cacheable=False` for those and
    this class will refuse to read or write.
    """

    key_prefix = "optimizer:response"
    index_key_prefix = "optimizer:response:index"

    def __init__(
        self,
        *,
        ttl_seconds: int = 600,
        semantic_enabled: bool = True,
        similarity_threshold: float = 0.92,
        index_size: int = 200,
    ):
        self.ttl_seconds = ttl_seconds
        self.semantic_enabled = semantic_enabled
        self.similarity_threshold = similarity_threshold
        self.index_size = index_size
        self.hits = 0
        self.misses = 0
        self.semantic_hits = 0

    @staticmethod
    def is_cacheable(*, streaming: bool, has_tools: bool, temperature: float = 0.0, cacheable: bool = True) -> bool:
        if not cacheable:
            return False
        if streaming or has_tools:
            return False
        if temperature and temperature > 0:
            return False
        return True

    def _key(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        provider: str,
        org_id: Optional[str],
        project_id: Optional[str],
    ) -> str:
        return f"{self.key_prefix}:{_hash_request(messages, model, provider, org_id, project_id)}"

    def _index_key(self, model: str, provider: str, org_id: Optional[str], project_id: Optional[str]) -> str:
        return f"{self.index_key_prefix}:{provider}:{model}:{_scope_key(org_id, project_id)}"

    async def get(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        provider: str,
        *,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        cached = await cache_get_json(self._key(messages, model, provider, org_id, project_id))
        if cached is not None:
            self.hits += 1
            return cached

        if self.semantic_enabled:
            semantic_match = await self._get_semantic(messages, model, provider, org_id, project_id)
            if semantic_match is not None:
                self.semantic_hits += 1
                self.hits += 1
                return semantic_match

        self.misses += 1
        return None

    async def _get_semantic(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        provider: str,
        org_id: Optional[str],
        project_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        index = await cache_get_json(self._index_key(model, provider, org_id, project_id))
        if not index:
            return None

        query = _fingerprint(messages)
        best_key: Optional[str] = None
        best_score = 0.0
        for entry in index:
            score = _cosine(query, entry.get("terms") or {})
            if score > best_score:
                best_score = score
                best_key = entry.get("key")

        if best_key is None or best_score < self.similarity_threshold:
            return None
        return await cache_get_json(best_key)

    async def set(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        provider: str,
        response: Dict[str, Any],
        *,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> None:
        key = self._key(messages, model, provider, org_id, project_id)
        await cache_set_json(key, response, ttl=self.ttl_seconds)
        if self.semantic_enabled:
            await self._index(key, messages, model, provider, org_id, project_id)

    async def _index(
        self,
        key: str,
        messages: List[Dict[str, Any]],
        model: str,
        provider: str,
        org_id: Optional[str],
        project_id: Optional[str],
    ) -> None:
        index_key = self._index_key(model, provider, org_id, project_id)
        index: List[Dict[str, Any]] = await cache_get_json(index_key) or []
        index = [entry for entry in index if entry.get("key") != key]
        index.append({"key": key, "terms": _fingerprint(messages)})
        if len(index) > self.index_size:
            index = index[-self.index_size:]
        await cache_set_json(index_key, index, ttl=self.ttl_seconds)

    def stats(self) -> Dict[str, int]:
        return {"hits": self.hits, "misses": self.misses, "semantic_hits": self.semantic_hits}
