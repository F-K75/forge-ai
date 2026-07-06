from __future__ import annotations

from typing import Dict, List, Optional

from .provider import BaseProviderAdapter


class ProviderRegistry:
    """Registers providers and exposes simple lookup APIs."""

    def __init__(self) -> None:
        self._providers: Dict[str, BaseProviderAdapter] = {}
        self._provider_priority: Dict[str, int] = {}
        self._provider_models: Dict[str, List[str]] = {}

    def register_provider(self, provider: BaseProviderAdapter, *, name: Optional[str] = None, priority: int = 0, models: Optional[List[str]] = None) -> None:
        provider_name = name or provider.name
        self._providers[provider_name] = provider
        self._provider_priority[provider_name] = priority
        if models:
            self._provider_models[provider_name] = models
        elif getattr(provider, "default_model", None):
            self._provider_models[provider_name] = [provider.default_model]

    def get_provider(self, name: str) -> Optional[BaseProviderAdapter]:
        return self._providers.get(name)

    def list_providers(self) -> List[Dict[str, object]]:
        providers = []
        for name, provider in sorted(self._providers.items(), key=lambda item: self._provider_priority.get(item[0], 0)):
            providers.append({
                "name": name,
                "priority": self._provider_priority.get(name, 0),
                "default_model": getattr(provider, "default_model", None),
                "supports_stream": getattr(provider, "supports_stream", True),
            })
        return providers

    def register_model(self, provider_name: str, model_name: str) -> None:
        models = self._provider_models.setdefault(provider_name, [])
        if model_name not in models:
            models.append(model_name)

    def list_models(self, provider_name: Optional[str] = None) -> List[Dict[str, object]]:
        if provider_name is not None:
            models = self._provider_models.get(provider_name, [])
            return [{"provider": provider_name, "name": model} for model in models]
        result = []
        for provider, models in self._provider_models.items():
            for model in models:
                result.append({"provider": provider, "name": model})
        return result
