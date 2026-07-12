from __future__ import annotations

import logging
from typing import List

import httpx

from core.config import get_settings

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


async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a batch of strings via the OpenAI embeddings API.

    No local/open-source fallback by design (see project decision: provider
    embeddings API + Mongo-stored vectors, not a local model). If
    `openai_api_key` isn't configured, raises immediately rather than
    silently returning zero vectors, which would otherwise poison
    similarity rankings.
    """
    if not texts:
        return []

    settings = get_settings()
    if not settings.openai_api_key:
        raise EmbeddingUnavailable("OPENAI_API_KEY is not configured; semantic retrieval is disabled")

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
            raise EmbeddingUnavailable(str(exc)) from exc

    data = response.json()["data"]
    # OpenAI's API returns entries in request order but not guaranteed
    # contiguous by index under batching -- sort defensively.
    ordered = sorted(data, key=lambda item: item["index"])
    return [item["embedding"] for item in ordered]


async def embed_text(text: str) -> List[float]:
    embeddings = await embed_texts([text])
    return embeddings[0]
