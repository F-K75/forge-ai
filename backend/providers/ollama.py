from __future__ import annotations

from typing import Any, AsyncIterator, Dict, List

import httpx

from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError

OLLAMA_BASE_URL = "http://localhost:11434"


class OllamaAdapter(BaseProviderAdapter):
    name = "ollama"
    default_model = "llama3.1:8b"

    async def health_check(self) -> bool:
        url = f"{self.base_url or OLLAMA_BASE_URL}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(url)
                return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def chat_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> CompletionResponse:
        url = f"{self.base_url or OLLAMA_BASE_URL}/api/chat"
        payload = {"model": model, "messages": messages, "stream": False}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(f"ollama request failed: {exc}") from exc
        data = response.json()
        text = data.get("message", {}).get("content", "") or ""
        return CompletionResponse(
            text=text,
            provider=self.name,
            model=model,
            usage={
                "prompt_tokens": data.get("prompt_eval_count", 0) or 0,
                "completion_tokens": data.get("eval_count", 0) or 0,
                "total_tokens": (data.get("prompt_eval_count", 0) or 0) + (data.get("eval_count", 0) or 0),
            },
        )

    async def stream_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> AsyncIterator[str]:
        url = f"{self.base_url or OLLAMA_BASE_URL}/api/chat"
        payload = {"model": model, "messages": messages, "stream": True}

        async def _iter():
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                try:
                    async with client.stream("POST", url, json=payload) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if not line:
                                continue
                            import json

                            chunk = json.loads(line)
                            delta = chunk.get("message", {}).get("content", "")
                            if delta:
                                yield delta
                except httpx.HTTPError as exc:
                    raise ProviderError(f"ollama stream failed: {exc}") from exc

        return _iter()
