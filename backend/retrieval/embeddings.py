from __future__ import annotations

import logging
import time
from typing import List

import httpx

from core.config import get_settings
from core.processing_boundary import Purpose, check_platform_model_allowed

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
_OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"


class EmbeddingUnavailable(Exception):
    """Raised when no embeddings provider is configured (no OpenAI API key)
    or the embeddings call itself fails. Callers should treat this as a
    signal to skip semantic indexing/retrieval for this request rather than
    fail the surrounding operation -- retrieval is an optimization, not a
    correctness dependency."""


class EmbeddingNotPermitted(EmbeddingUnavailable):
    """The processing boundary refused the call: embedding would send BYOK
    content to Forge's embeddings key without `platform_model_processing`
    consent (F28, §5.3). Raised before any network I/O."""


async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a batch of strings via the OpenAI embeddings API.

    No local/open-source fallback by design (see project decision: provider
    embeddings API + Mongo-stored vectors, not a local model). If
    `openai_api_key` isn't configured, raises immediately rather than
    silently returning zero vectors, which would otherwise poison
    similarity rankings.

    This is a Forge-credential model call, so it passes the processing
    boundary first (the build scope's snapshot, if any) and is recorded as
    one `ai_usage` attempt (purpose `retrieval_embedding`).
    """
    if not texts:
        return []

    from core.llm.accounting import AttemptAccounting

    acct = AttemptAccounting.create(purpose=Purpose.RETRIEVAL_EMBEDDING, agent="retrieval")
    if not check_platform_model_allowed(acct.boundary, Purpose.RETRIEVAL_EMBEDDING).allowed:
        raise EmbeddingNotPermitted("retrieval embeddings are not permitted for this content (BYOK boundary)")

    settings = get_settings()
    if not settings.openai_api_key:
        raise EmbeddingUnavailable("OPENAI_API_KEY is not configured; semantic retrieval is disabled")

    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                _OPENAI_EMBEDDINGS_URL,
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": EMBEDDING_MODEL, "input": texts},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Embeddings request failed: %s", exc)
            await acct.record(
                outcome="error", credential="forge", provider="openai", model=EMBEDDING_MODEL,
                error_class=exc, latency_ms=(time.perf_counter() - started) * 1000,
            )
            raise EmbeddingUnavailable(str(exc)) from exc

    payload = response.json()
    usage = payload.get("usage") or {}
    await acct.record(
        outcome="success", credential="forge", provider="openai", model=EMBEDDING_MODEL,
        prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
        latency_ms=(time.perf_counter() - started) * 1000,
    )
    data = payload["data"]
    # OpenAI's API returns entries in request order but not guaranteed
    # contiguous by index under batching -- sort defensively.
    ordered = sorted(data, key=lambda item: item["index"])
    return [item["embedding"] for item in ordered]


async def embed_text(text: str) -> List[float]:
    embeddings = await embed_texts([text])
    return embeddings[0]
