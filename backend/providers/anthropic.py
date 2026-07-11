from __future__ import annotations

from typing import Any, AsyncIterator, Dict, List

from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError


class AnthropicAdapter(BaseProviderAdapter):
    name = "anthropic"
    default_model = "claude-sonnet-4-6"

    async def chat_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> CompletionResponse:
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover
            raise ProviderError("anthropic package missing") from exc

        if not self.api_key:
            return CompletionResponse(text="", provider=self.name, model=model, usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})

        create_kwargs: Dict[str, Any] = {
            "model": model,
            "max_tokens": kwargs.get("max_tokens", 8192),
            "messages": messages,
        }
        if kwargs.get("temperature") is not None:
            create_kwargs["temperature"] = kwargs["temperature"]
        if kwargs.get("tools"):
            create_kwargs["tools"] = kwargs["tools"]

        client = anthropic.AsyncAnthropic(api_key=self.api_key, timeout=self.timeout)
        response = await client.messages.create(**create_kwargs)
        blocks = list(getattr(response.content, "__iter__", lambda: [])())
        text = "".join(block.text for block in blocks if getattr(block, "type", None) == "text")
        tool_calls = [
            {"id": block.id, "name": block.name, "arguments": block.input}
            for block in blocks
            if getattr(block, "type", None) == "tool_use"
        ] or None
        usage = getattr(response, "usage", None)
        return CompletionResponse(
            text=text or "",
            provider=self.name,
            model=model,
            finish_reason=getattr(response, "stop_reason", None),
            tool_calls=tool_calls,
            usage={
                "prompt_tokens": getattr(usage, "input_tokens", 0) or 0,
                "completion_tokens": getattr(usage, "output_tokens", 0) or 0,
                "total_tokens": (getattr(usage, "input_tokens", 0) or 0) + (getattr(usage, "output_tokens", 0) or 0),
                "cached_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
            },
        )

    async def stream_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> AsyncIterator[str]:
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover
            raise ProviderError("anthropic package missing") from exc

        if not self.api_key:
            async def _empty():
                if False:
                    yield ""
            async for item in _empty():
                yield item
            return

        client = anthropic.AsyncAnthropic(api_key=self.api_key, timeout=self.timeout)
        async with client.messages.stream(model=model, max_tokens=kwargs.get("max_tokens", 8192), messages=messages) as stream:
            async for text in stream.text_stream:
                yield text
