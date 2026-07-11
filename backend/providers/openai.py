from __future__ import annotations

from typing import Any, AsyncIterator, Dict, List

from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError


class OpenAIAdapter(BaseProviderAdapter):
    name = "openai"
    default_model = "gpt-4o-mini"

    async def chat_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> CompletionResponse:
        try:
            import openai
        except ImportError as exc:  # pragma: no cover
            raise ProviderError("openai package missing") from exc

        if not self.api_key:
            return CompletionResponse(text="", provider=self.name, model=model, usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        create_kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", 8192),
        }
        if kwargs.get("temperature") is not None:
            create_kwargs["temperature"] = kwargs["temperature"]
        if kwargs.get("tools"):
            create_kwargs["tools"] = kwargs["tools"]

        client = openai.AsyncOpenAI(api_key=self.api_key, base_url=self.base_url or None, timeout=self.timeout)
        response = await client.chat.completions.create(**create_kwargs)
        choice = response.choices[0]
        text = choice.message.content or ""
        usage = getattr(response, "usage", None)
        tool_calls = None
        raw_tool_calls = getattr(choice.message, "tool_calls", None)
        if raw_tool_calls:
            tool_calls = [
                {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                }
                for tc in raw_tool_calls
            ]
        return CompletionResponse(
            text=text,
            provider=self.name,
            model=model,
            finish_reason=getattr(choice, "finish_reason", None),
            tool_calls=tool_calls,
            usage={
                "prompt_tokens": getattr(usage, "prompt_tokens", 0) or 0,
                "completion_tokens": getattr(usage, "completion_tokens", 0) or 0,
                "total_tokens": getattr(usage, "total_tokens", 0) or 0,
            },
        )

    async def stream_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> AsyncIterator[str]:
        try:
            import openai
        except ImportError as exc:  # pragma: no cover
            raise ProviderError("openai package missing") from exc

        if not self.api_key:
            async def _empty():
                if False:
                    yield ""
            async for item in _empty():
                yield item
            return

        client = openai.AsyncOpenAI(api_key=self.api_key, base_url=self.base_url or None, timeout=self.timeout)
        stream = await client.chat.completions.create(model=model, messages=messages, max_tokens=kwargs.get("max_tokens", 8192), stream=True)
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta
