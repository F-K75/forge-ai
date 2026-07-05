from __future__ import annotations

from typing import Any, AsyncIterator, Dict, List

import httpx

from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def _to_gemini_contents(messages: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], str]:
    contents = []
    system_parts = []
    for message in messages:
        role = message.get("role")
        content = message.get("content", "")
        if role == "system":
            system_parts.append(content)
            continue
        contents.append({"role": "model" if role == "assistant" else "user", "parts": [{"text": content}]})
    return contents, "\n".join(system_parts)


class GeminiAdapter(BaseProviderAdapter):
    name = "gemini"
    default_model = "gemini-1.5-pro"

    async def health_check(self) -> bool:
        return bool(self.api_key)

    async def chat_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> CompletionResponse:
        if not self.api_key:
            return CompletionResponse(text="", provider=self.name, model=model, usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        contents, system_instruction = _to_gemini_contents(messages)
        url = f"{self.base_url or GEMINI_BASE_URL}/models/{model}:generateContent"
        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {"maxOutputTokens": kwargs.get("max_tokens", 8192)},
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(url, json=payload, params={"key": self.api_key})
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(f"gemini request failed: {exc}") from exc
        data = response.json()
        candidates = data.get("candidates") or [{}]
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts)
        usage_meta = data.get("usageMetadata", {})
        return CompletionResponse(
            text=text,
            provider=self.name,
            model=model,
            usage={
                "prompt_tokens": usage_meta.get("promptTokenCount", 0),
                "completion_tokens": usage_meta.get("candidatesTokenCount", 0),
                "total_tokens": usage_meta.get("totalTokenCount", 0),
            },
        )

    async def stream_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> AsyncIterator[str]:
        response = await self.chat_completion(model=model, messages=messages, **kwargs)

        async def _iter():
            if response.text:
                yield response.text

        return _iter()
