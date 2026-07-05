from __future__ import annotations

from typing import Any, AsyncIterator, Dict, List

import httpx

from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError

TOGETHER_BASE_URL = "https://api.together.xyz/v1"


class TogetherAdapter(BaseProviderAdapter):
    name = "together"
    default_model = "meta-llama/Llama-3-8b-chat-hf"

    async def health_check(self) -> bool:
        return bool(self.api_key)

    async def chat_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> CompletionResponse:
        if not self.api_key:
            return CompletionResponse(text="", provider=self.name, model=model, usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        url = f"{self.base_url or TOGETHER_BASE_URL}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        payload = {"model": model, "messages": messages, "max_tokens": kwargs.get("max_tokens", 8192)}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(f"together request failed: {exc}") from exc
        data = response.json()
        choice = (data.get("choices") or [{}])[0]
        text = choice.get("message", {}).get("content", "") or ""
        usage = data.get("usage", {})
        return CompletionResponse(
            text=text,
            provider=self.name,
            model=model,
            usage={
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            },
        )

    async def stream_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> AsyncIterator[str]:
        response = await self.chat_completion(model=model, messages=messages, **kwargs)

        async def _iter():
            if response.text:
                yield response.text

        return _iter()
