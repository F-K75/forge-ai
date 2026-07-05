from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from core.config import get_settings


DEFAULT_LLM_CONFIG: Dict[str, Any] = {
    "default_provider": "anthropic",
    "fallback_chain": ["anthropic", "openai"],
    "retry": {"max_attempts": 2, "backoff_seconds": 0.25},
    "timeout_seconds": 120,
    "cache_ttl_seconds": 300,
    "agent_overrides": {
        "architect": {"provider": "anthropic", "model": "claude-sonnet-4-6"},
        "developer": {"provider": "anthropic", "model": "claude-sonnet-4-6"},
    },
}


class LLMConfigLoader:
    """Loads router configuration from YAML, env vars, and simple DB overrides."""

    def __init__(self, config_path: Optional[Path] = None) -> None:
        self.settings = get_settings()
        self.config_path = config_path or Path(__file__).resolve().parents[2] / "config" / "llm.yaml"
        self._config = self._load_from_disk()

    def load(self, *, agent_name: Optional[str] = None) -> Dict[str, Any]:
        config = dict(self._config)
        agent_override = None
        if agent_name:
            agent_override = config.get("agent_overrides", {}).get(agent_name, {})
            if agent_override:
                config.update(agent_override)
        config.setdefault("default_provider", "anthropic")
        config.setdefault("fallback_chain", [config["default_provider"]])
        config.setdefault("retry", {"max_attempts": 2, "backoff_seconds": 0.25})
        config.setdefault("timeout_seconds", 120)
        config.setdefault("cache_ttl_seconds", 300)
        return config

    def reload(self) -> Dict[str, Any]:
        self._config = self._load_from_disk()
        return self.load()

    def set_agent_override(self, agent_name: str, override: Dict[str, Any]) -> Dict[str, Any]:
        overrides = self._config.setdefault("agent_overrides", {})
        overrides[agent_name] = {**overrides.get(agent_name, {}), **override}
        return overrides[agent_name]

    def _load_from_disk(self) -> Dict[str, Any]:
        config: Dict[str, Any] = dict(DEFAULT_LLM_CONFIG)
        if self.config_path.exists():
            try:
                with self.config_path.open("r", encoding="utf-8") as handle:
                    loaded = yaml.safe_load(handle) or {}
                if isinstance(loaded, dict):
                    config = self._merge_configs(config, loaded)
            except Exception:
                pass

        env_config = self._load_from_env()
        config = self._merge_configs(config, env_config)
        return config

    def _load_from_env(self) -> Dict[str, Any]:
        config: Dict[str, Any] = {}
        default_provider = os.getenv("LLM_DEFAULT_PROVIDER")
        if default_provider:
            config["default_provider"] = default_provider
        fallback_chain = os.getenv("LLM_FALLBACK_CHAIN")
        if fallback_chain:
            config["fallback_chain"] = [part.strip() for part in fallback_chain.split(",") if part.strip()]
        retry_attempts = os.getenv("LLM_RETRY_ATTEMPTS")
        if retry_attempts:
            config.setdefault("retry", {})["max_attempts"] = int(retry_attempts)
        retry_backoff = os.getenv("LLM_RETRY_BACKOFF")
        if retry_backoff:
            config.setdefault("retry", {})["backoff_seconds"] = float(retry_backoff)
        timeout = os.getenv("LLM_TIMEOUT_SECONDS")
        if timeout:
            config["timeout_seconds"] = int(timeout)
        cache_ttl = os.getenv("LLM_CACHE_TTL_SECONDS")
        if cache_ttl:
            config["cache_ttl_seconds"] = int(cache_ttl)
        return config

    @staticmethod
    def _merge_configs(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        merged = dict(base)
        for key, value in override.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = LLMConfigLoader._merge_configs(merged[key], value)
            else:
                merged[key] = value
        return merged
