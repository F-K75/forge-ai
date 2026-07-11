from __future__ import annotations

from typing import Any, AsyncIterator, Dict, List, Optional

from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError


class AzureOpenAIAdapter(BaseProviderAdapter):
    """Azure OpenAI Service adapter.

    Azure addresses models by *deployment name* rather than the raw model
    id used by other providers, and requires an endpoint + api-version in
    addition to the API key. `model` passed to `chat_completion` /
    `stream_completion` is treated as the deployment name.
    """

    name = "azure_openai"
    default_model = "gpt-4o-mini"

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        api_version: str = "2024-10-21",
        deployment: Optional[str] = None,
        timeout: int = 60,
    ) -> None:
        super().__init__(api_key=api_key, base_url=endpoint, timeout=timeout)
        self.endpoint = endpoint
        self.api_version = api_version
        self.deployment = deployment
        if deployment:
            self.default_model = deployment

    def _client(self):
        try:
            import openai
        except ImportError as exc:  # pragma: no cover
            raise ProviderError("openai package missing") from exc
        return openai.AsyncAzureOpenAI(
            api_key=self.api_key,
            azure_endpoint=self.endpoint,
            api_version=self.api_version,
            timeout=self.timeout,
        )

    async def chat_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> CompletionResponse:
        if not self.api_key or not self.endpoint:
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

        client = self._client()
        response = await client.chat.completions.create(**create_kwargs)
        choice = response.choices[0]
        text = choice.message.content or ""
        usage = getattr(response, "usage", None)
        tool_calls = None
        raw_tool_calls = getattr(choice.message, "tool_calls", None)
        if raw_tool_calls:
            tool_calls = [
                {"id": tc.id, "name": tc.function.name, "arguments": tc.function.arguments}
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
        if not self.api_key or not self.endpoint:
            async def _empty():
                if False:
                    yield ""
            async for item in _empty():
                yield item
            return

        client = self._client()
        stream = await client.chat.completions.create(
            model=model, messages=messages, max_tokens=kwargs.get("max_tokens", 8192), stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    async def health_check(self) -> bool:
        return bool(self.api_key and self.endpoint)
