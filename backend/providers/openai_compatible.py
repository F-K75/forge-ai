"""Self-hosted OpenAI-compatible providers (vLLM, LiteLLM proxy).

Both vLLM (`vllm serve ...`) and the LiteLLM proxy expose the OpenAI
`/v1/chat/completions` + `/v1/models` API, so one adapter covers both; the
``vllm`` and ``litellm`` registrations differ only in name, env config and
how they price usage.

Unlike the hosted providers these are addressed by base URL (the API key is
optional), so "configured" means "base URL set": with no ``VLLM_BASE_URL`` /
``LITELLM_BASE_URL`` the provider is simply never registered.

Cost: self-hosted inference has no per-token bill, so the default rate is 0.
Operators who want to charge back GPU cost can set a per-1K-token rate
(``*_INPUT_COST_PER_1K`` / ``*_OUTPUT_COST_PER_1K``, same unit as
``core.ai_usage.MODEL_COSTS``). The router asks the adapter for the cost via
``cost_for_usage`` instead of looking the model up in ``MODEL_COSTS`` --
self-hosted model names aren't in that table and would otherwise be billed
at the default (Claude Sonnet) rate, overstating spend in the budget manager.
LiteLLM additionally reports the real upstream cost in the
``x-litellm-response-cost`` response header; when present (non-streaming)
it's used as the authoritative ``cost_usd``.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Sequence, Tuple

import httpx

from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError

logger = logging.getLogger(__name__)

LITELLM_COST_HEADER = "x-litellm-response-cost"


def _normalize_base_url(base_url: str) -> str:
    """Accept ``http://host:8000`` or ``http://host:8000/v1`` (with or
    without a trailing slash) and return the ``.../v1`` API root."""
    url = (base_url or "").strip().rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


def parse_model_list(raw: Optional[str | Sequence[str]]) -> List[str]:
    if not raw:
        return []
    parts = raw.split(",") if isinstance(raw, str) else list(raw)
    return [p.strip() for p in parts if p and p.strip()]


class OpenAICompatibleAdapter(BaseProviderAdapter):
    """Adapter for any server speaking the OpenAI chat-completions API."""

    name = "openai_compatible"
    default_model = ""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: Optional[str] = None,
        name: Optional[str] = None,
        models: Optional[Sequence[str]] = None,
        timeout: int = 120,
        input_cost_per_1k: float = 0.0,
        output_cost_per_1k: float = 0.0,
        use_cost_header: bool = False,
    ) -> None:
        if not base_url:
            raise ValueError("OpenAICompatibleAdapter requires a base_url")
        super().__init__(api_key=api_key or None, base_url=_normalize_base_url(base_url), timeout=timeout)
        if name:
            self.name = name
        self.models: List[str] = list(models or [])
        # First configured model is the default; with none configured the
        # served model list is discovered from GET /models on first use.
        self.default_model = self.models[0] if self.models else ""
        self.input_cost_per_1k = float(input_cost_per_1k or 0.0)
        self.output_cost_per_1k = float(output_cost_per_1k or 0.0)
        self.use_cost_header = use_cost_header
        self._discovered_models: Optional[List[str]] = None
        # Read by LLMRouter._finalize_stream_usage after a stream completes.
        self.last_stream_usage: Optional[Dict[str, int]] = None

    # -- helpers ---------------------------------------------------------

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def _list_remote_models(self) -> List[str]:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{self.base_url}/models", headers=self._headers())
            response.raise_for_status()
        data = response.json() or {}
        return [str(item.get("id")) for item in data.get("data", []) if item.get("id")]

    async def _resolve_model(self, model: Optional[str]) -> str:
        """Map the requested model onto one this server actually serves.

        Callers routing across a local-first chain (e.g. the kernel's
        ``prefer_local`` preference ``("ollama", "vllm", ...)``) send ONE
        model id to every provider in the chain -- typically an Ollama tag
        like ``qwen2.5-coder:32b`` that vLLM doesn't know. Rather than 404 and
        fail over to a paid cloud provider, fall back to this server's
        default model. A model this server does serve is passed through.
        """
        if self.models:
            return model if model in self.models else self.models[0]
        if self._discovered_models is None:
            try:
                self._discovered_models = await self._list_remote_models()
            except (httpx.HTTPError, ValueError) as exc:
                logger.debug("%s model discovery failed: %s", self.name, exc)
                self._discovered_models = []
            if self._discovered_models and not self.default_model:
                self.default_model = self._discovered_models[0]
        if self._discovered_models and model not in self._discovered_models:
            return self._discovered_models[0]
        if not model:
            raise ProviderError(f"{self.name}: no model configured and none discovered")
        return model

    def _build_payload(self, model: str, messages: List[Dict[str, Any]], kwargs: Dict[str, Any], *, stream: bool) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", 8192),
            "stream": stream,
        }
        if kwargs.get("temperature") is not None:
            payload["temperature"] = kwargs["temperature"]
        if kwargs.get("tools"):
            payload["tools"] = kwargs["tools"]
        if stream:
            # Ask for a final usage chunk so streamed calls report real
            # token counts instead of the router's estimate.
            payload["stream_options"] = {"include_usage": True}
        return payload

    @staticmethod
    def _parse_usage(raw: Optional[Dict[str, Any]]) -> Dict[str, int]:
        raw = raw or {}
        prompt = int(raw.get("prompt_tokens", 0) or 0)
        completion = int(raw.get("completion_tokens", 0) or 0)
        total = int(raw.get("total_tokens", 0) or 0) or prompt + completion
        return {"prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": total}

    def cost_for_usage(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        """USD cost of one call at this provider's configured per-1K rates
        (0 by default for self-hosted inference)."""
        return (prompt_tokens * self.input_cost_per_1k + completion_tokens * self.output_cost_per_1k) / 1000

    # -- BaseProviderAdapter ---------------------------------------------

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/models", headers=self._headers())
                return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def get_models(self) -> List[str]:
        if self.models:
            return list(self.models)
        try:
            return await self._list_remote_models()
        except (httpx.HTTPError, ValueError):
            return [self.default_model] if self.default_model else []

    async def chat_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> CompletionResponse:
        resolved = await self._resolve_model(model)
        payload = self._build_payload(resolved, messages, kwargs, stream=False)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(f"{self.base_url}/chat/completions", json=payload, headers=self._headers())
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(f"{self.name} request failed: {exc}") from exc
        data = response.json() or {}
        choices = data.get("choices") or []
        if not choices:
            raise ProviderError(f"{self.name} returned no choices")
        choice = choices[0]
        message = choice.get("message") or {}
        tool_calls = None
        if message.get("tool_calls"):
            tool_calls = [
                {
                    "id": tc.get("id"),
                    "name": (tc.get("function") or {}).get("name"),
                    "arguments": (tc.get("function") or {}).get("arguments"),
                }
                for tc in message["tool_calls"]
            ]
        usage: Dict[str, Any] = self._parse_usage(data.get("usage"))
        usage["cost_usd"] = self._response_cost(response, resolved, usage)
        return CompletionResponse(
            text=message.get("content") or "",
            provider=self.name,
            model=resolved,
            usage=usage,
            finish_reason=choice.get("finish_reason"),
            tool_calls=tool_calls,
        )

    def _response_cost(self, response: Any, model: str, usage: Dict[str, int]) -> float:
        if self.use_cost_header:
            headers = getattr(response, "headers", None) or {}
            header_value = headers.get(LITELLM_COST_HEADER) if hasattr(headers, "get") else None
            if header_value not in (None, ""):
                try:
                    return float(header_value)
                except (TypeError, ValueError):
                    pass
        return self.cost_for_usage(model, usage["prompt_tokens"], usage["completion_tokens"])

    async def stream_completion(self, *, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> AsyncIterator[str]:
        resolved = await self._resolve_model(model)
        payload = self._build_payload(resolved, messages, kwargs, stream=True)
        self.last_stream_usage = None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream(
                    "POST", f"{self.base_url}/chat/completions", json=payload, headers=self._headers()
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[len("data:"):].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except ValueError:
                            continue
                        if chunk.get("usage"):
                            self.last_stream_usage = self._parse_usage(chunk["usage"])
                        for choice in chunk.get("choices") or []:
                            delta = (choice.get("delta") or {}).get("content")
                            if delta:
                                yield delta
            except httpx.HTTPError as exc:
                raise ProviderError(f"{self.name} stream failed: {exc}") from exc


# name, settings-attribute prefix, registry priority, use LiteLLM cost header
_SELF_HOSTED_PROVIDERS: Tuple[Tuple[str, str, int, bool], ...] = (
    ("vllm", "vllm", 45, False),
    ("litellm", "litellm", 44, True),
)

# Providers that run on operator-owned infrastructure and count as the
# "local" tier for prefer_local routing.
LOCAL_PROVIDERS: Tuple[str, ...] = ("vllm", "ollama")


def build_self_hosted_adapters(settings: Any) -> List[Tuple[OpenAICompatibleAdapter, int]]:
    """Build the vLLM / LiteLLM adapters that have a base URL configured.

    Returns ``(adapter, priority)`` pairs; unconfigured providers are omitted
    entirely so they're never tried (and never trip the circuit breaker).
    """
    adapters: List[Tuple[OpenAICompatibleAdapter, int]] = []
    for name, prefix, priority, use_cost_header in _SELF_HOSTED_PROVIDERS:
        base_url = getattr(settings, f"{prefix}_base_url", "") or ""
        if not base_url.strip():
            continue
        adapters.append((
            OpenAICompatibleAdapter(
                name=name,
                base_url=base_url,
                api_key=getattr(settings, f"{prefix}_api_key", "") or None,
                models=parse_model_list(getattr(settings, f"{prefix}_models", "")),
                timeout=int(getattr(settings, f"{prefix}_timeout_seconds", 120) or 120),
                input_cost_per_1k=float(getattr(settings, f"{prefix}_input_cost_per_1k", 0.0) or 0.0),
                output_cost_per_1k=float(getattr(settings, f"{prefix}_output_cost_per_1k", 0.0) or 0.0),
                use_cost_header=use_cost_header,
            ),
            priority,
        ))
    return adapters
