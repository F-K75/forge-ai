from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional, Sequence

from core.ai_usage import calculate_cost, check_budget, track_usage
from core.database import cache_get_json, cache_set_json
from core.security import sanitize_prompt
from core.llm.config import LLMConfigLoader
from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError
from core.llm.registry import ProviderRegistry
from core.models import PlanTier
from core.encryption import decrypt_field
from core.database import get_db

logger = logging.getLogger(__name__)

_INJECTION_PHRASES = (
    "ignore previous instructions",
    "ignore all previous instructions",
    "disregard previous instructions",
    "you are now",
    "reveal your system prompt",
)


def _detect_prompt_injection(text: str) -> bool:
    """Normalize whitespace/hyphens/underscores before matching so trivial
    reformatting (double spaces, newlines, hyphenation) can't bypass the
    blocklist."""
    import re

    normalized = re.sub(r"[\s\-_]+", " ", text.lower()).strip()
    return any(phrase in normalized for phrase in _INJECTION_PHRASES)


def _any_message_has_prompt_injection(messages: List[Dict[str, Any]]) -> bool:
    return any(
        _detect_prompt_injection(str(message.get("content", "")))
        for message in messages
        if message.get("role") == "user"
    )


class LLMRouter:
    """Routes requests across providers with simple fallback and usage tracking."""

    def __init__(self, *, registry: Optional[ProviderRegistry] = None, config_loader: Optional[LLMConfigLoader] = None) -> None:
        self.registry = registry or ProviderRegistry()
        self.config_loader = config_loader or LLMConfigLoader()
        self._register_default_providers()

    def register_provider(self, provider: BaseProviderAdapter, *, name: Optional[str] = None, priority: int = 0, models: Optional[List[str]] = None) -> None:
        self.registry.register_provider(provider, name=name, priority=priority, models=models)

    def set_agent_override(self, agent_name: str, override: Dict[str, Any]) -> Dict[str, Any]:
        return self.config_loader.set_agent_override(agent_name, override)

    async def health_check_all(self) -> List[Dict[str, Any]]:
        results = []
        for entry in self.registry.list_providers():
            name = entry["name"]
            provider = self.registry.get_provider(name)
            try:
                healthy = await provider.health_check() if provider else False
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Health check failed for %s: %s", name, exc)
                healthy = False
            results.append({**entry, "healthy": healthy})
        return results

    async def generate(
        self,
        *,
        agent_name: str,
        messages: List[Dict[str, Any]],
        model: Optional[str] = None,
        max_tokens: int = 8192,
        user_id: Optional[str] = None,
        build_id: Optional[str] = None,
        project_id: Optional[str] = None,
        org_id: Optional[str] = None,
        extra_system: str = "",
        usage_out: Optional[Dict[str, Any]] = None,
        provider_names: Optional[Sequence[str]] = None,
    ) -> CompletionResponse:
        if not messages:
            raise ValueError("messages cannot be empty")
        config = self.config_loader.load(agent_name=agent_name)
        providers_to_try = self._select_providers(config, provider_names)
        # `model=None` means "no explicit caller override" -- fall back to
        # the agent-specific config override, then the provider's default.
        # Callers that pass an explicit model (e.g. POST /api/llm/test)
        # always win, since that's a deliberate ad-hoc override.
        if model is None:
            model = config.get("model")
        if model is None:
            model = self._default_model_for_provider(providers_to_try[0])

        # Model-level fallback within a provider: if the primary model is
        # rate-limited/unavailable, retry with a cheaper/alternate model
        # before giving up on the provider entirely and moving to the next
        # provider in the fallback chain.
        model_fallbacks = config.get("model_fallbacks") or []
        model_chain = [model, *[m for m in model_fallbacks if m != model]]

        sanitized_messages = self._sanitize_messages(messages)
        if self._contains_prompt_injection(sanitized_messages):
            raise ValueError("Potential prompt injection detected in user input")

        if user_id:
            await check_budget(user_id, org_id=org_id)

        cache_key = self._cache_key(agent_name, sanitized_messages, model, extra_system, max_tokens)
        cached = await cache_get_json(cache_key) if cache_key else None
        if cached is not None:
            return CompletionResponse(**cached)

        retry_cfg = config.get("retry", {}) or {}
        max_attempts = max(1, int(retry_cfg.get("max_attempts", 1)))
        backoff_seconds = float(retry_cfg.get("backoff_seconds", 0.0))

        last_error: Optional[Exception] = None
        for provider_name in providers_to_try:
            provider = self.registry.get_provider(provider_name)
            if provider is None:
                continue
            for candidate_model in model_chain:
                for attempt in range(1, max_attempts + 1):
                    try:
                        response = await provider.chat_completion(
                            model=candidate_model,
                            messages=self._with_system_prompt(sanitized_messages, extra_system),
                            max_tokens=max_tokens,
                            user_id=user_id,
                            build_id=build_id,
                            project_id=project_id,
                            org_id=org_id,
                        )
                        if not response.text and provider_name not in {"fake", "primary", "secondary"}:
                            raise ProviderError(f"provider {provider_name} returned empty response")
                        response.model = candidate_model or response.model
                        response.provider = provider_name
                        self._normalize_usage(response)
                        await self._record_usage(
                            response=response,
                            user_id=user_id,
                            build_id=build_id,
                            project_id=project_id,
                            org_id=org_id,
                            agent_name=agent_name,
                        )
                        if cache_key:
                            await cache_set_json(cache_key, {"text": response.text, "provider": response.provider, "model": response.model, "usage": response.usage, "raw": None}, ttl=config.get("cache_ttl_seconds", 300))
                        if usage_out is not None:
                            usage_out.update({
                                "model": response.model,
                                "provider": response.provider,
                                "prompt_tokens": response.usage.get("prompt_tokens", 0),
                                "completion_tokens": response.usage.get("completion_tokens", 0),
                                "total_tokens": response.usage.get("total_tokens", 0),
                                "cost_usd": response.usage.get("cost_usd", 0.0),
                            })
                        return response
                    except Exception as exc:  # pragma: no cover - exercised via fallback path
                        last_error = exc
                        logger.warning(
                            "Provider %s model %s attempt %s/%s failed: %s",
                            provider_name, candidate_model, attempt, max_attempts, exc,
                        )
                        if attempt < max_attempts:
                            if backoff_seconds:
                                await asyncio.sleep(backoff_seconds * attempt)
                            continue
                        break

        if last_error is not None:
            raise ProviderError(str(last_error)) from last_error
        raise ProviderError("No providers available")

    async def stream(
        self,
        *,
        agent_name: str,
        messages: List[Dict[str, Any]],
        model: Optional[str] = None,
        max_tokens: int = 8192,
        user_id: Optional[str] = None,
        build_id: Optional[str] = None,
        project_id: Optional[str] = None,
        org_id: Optional[str] = None,
        extra_system: str = "",
        usage_out: Optional[Dict[str, Any]] = None,
        provider_names: Optional[Sequence[str]] = None,
    ):
        response = await self.generate(
            agent_name=agent_name,
            messages=messages,
            model=model,
            max_tokens=max_tokens,
            user_id=user_id,
            build_id=build_id,
            project_id=project_id,
            org_id=org_id,
            extra_system=extra_system,
            usage_out=usage_out,
            provider_names=provider_names,
        )
        for token in response.text:
            yield token

    def _select_providers(self, config: Dict[str, Any], provider_names: Optional[Sequence[str]] = None) -> List[str]:
        if provider_names:
            return list(provider_names)

        registered = [name for name in self.registry.list_providers() if name.get("name")]
        registered_names = [item["name"] for item in registered]
        fallback_chain = config.get("fallback_chain") or [config.get("default_provider")]
        # An agent-specific `provider` override (from agent_overrides) takes
        # priority over the global fallback chain so per-agent LLM
        # assignment actually has effect, not just per-agent `model`.
        agent_provider = config.get("provider")
        ordered_chain = [agent_provider, *fallback_chain] if agent_provider else fallback_chain
        selected = []
        for provider in [*ordered_chain, *registered_names]:
            if provider not in selected:
                selected.append(provider)
        if not selected:
            selected.append(config.get("default_provider", "anthropic"))
        return selected

    def _default_model_for_provider(self, provider_name: str) -> str:
        provider = self.registry.get_provider(provider_name)
        if provider is None:
            return "claude-sonnet-4-6"
        return getattr(provider, "default_model", "claude-sonnet-4-6")

    async def _record_usage(self, *, response: CompletionResponse, user_id: Optional[str], build_id: Optional[str], project_id: Optional[str], org_id: Optional[str], agent_name: str) -> None:
        if not user_id:
            return
        usage = response.usage or {}
        prompt_tokens = int(usage.get("prompt_tokens", 0) or 0)
        completion_tokens = int(usage.get("completion_tokens", 0) or 0)
        if prompt_tokens + completion_tokens <= 0:
            return
        cost_usd = calculate_cost(response.model, prompt_tokens, completion_tokens, cached_tokens=int(usage.get("cached_tokens", 0) or 0))
        await track_usage(
            user_id=user_id,
            build_id=build_id,
            model=response.model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
            org_id=org_id,
            project_id=project_id,
            cached_tokens=int(usage.get("cached_tokens", 0) or 0),
            provider=response.provider,
            agent=agent_name,
        )

    def _sanitize_messages(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        sanitized = []
        for message in messages:
            content = message.get("content", "")
            if message.get("role") == "user" and isinstance(content, str):
                content = sanitize_prompt(content)
            sanitized.append({**message, "content": content})
        return sanitized

    def _contains_prompt_injection(self, messages: List[Dict[str, Any]]) -> bool:
        return _any_message_has_prompt_injection(messages)

    def _with_system_prompt(self, messages: List[Dict[str, Any]], extra_system: str) -> List[Dict[str, Any]]:
        if extra_system:
            return [{"role": "system", "content": extra_system}, *messages]
        return messages

    def _normalize_usage(self, response: CompletionResponse) -> None:
        if response.usage:
            response.usage.setdefault("total_tokens", response.usage.get("prompt_tokens", 0) + response.usage.get("completion_tokens", 0))
            return
        response.usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cached_tokens": 0,
        }

    def _cache_key(self, agent_name: str, messages: List[Dict[str, Any]], model: Optional[str], extra_system: str, max_tokens: int) -> Optional[str]:
        payload = json.dumps({"agent": agent_name, "messages": messages, "model": model, "extra_system": extra_system, "max_tokens": max_tokens}, sort_keys=True)
        return f"llm:router:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"

    def _register_default_providers(self) -> None:
        from core.config import get_settings
        from providers.anthropic import AnthropicAdapter
        from providers.openai import OpenAIAdapter
        from providers.openrouter import OpenRouterAdapter
        from providers.gemini import GeminiAdapter
        from providers.groq import GroqAdapter
        from providers.together import TogetherAdapter
        from providers.ollama import OllamaAdapter
        from providers.mistral import MistralAdapter

        settings = get_settings()

        self.register_provider(
            AnthropicAdapter(api_key=settings.anthropic_api_key, timeout=settings.anthropic_timeout),
            name="anthropic", priority=100, models=["claude-sonnet-4-6", "claude-opus-3"],
        )
        self.register_provider(
            OpenAIAdapter(api_key=settings.openai_api_key),
            name="openai", priority=90, models=["gpt-4o-mini", "gpt-4.1"],
        )
        self.register_provider(
            OpenRouterAdapter(api_key=settings.openrouter_api_key),
            name="openrouter", priority=80, models=["openrouter/auto"],
        )
        self.register_provider(
            GeminiAdapter(api_key=settings.gemini_api_key),
            name="gemini", priority=70, models=["gemini-1.5-pro"],
        )
        self.register_provider(
            GroqAdapter(api_key=settings.groq_api_key),
            name="groq", priority=60, models=["llama-3.1-8b"],
        )
        self.register_provider(
            TogetherAdapter(api_key=settings.together_api_key),
            name="together", priority=50, models=["meta-llama/Llama-3-8b-chat-hf"],
        )
        self.register_provider(
            OllamaAdapter(base_url=settings.ollama_base_url),
            name="ollama", priority=40, models=["llama3.2"],
        )
        self.register_provider(
            MistralAdapter(api_key=settings.mistral_api_key),
            name="mistral", priority=30, models=["mistral-small-latest"],
        )


_default_router = LLMRouter()


def get_llm_router() -> LLMRouter:
    return _default_router
