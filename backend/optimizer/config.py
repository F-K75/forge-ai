from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class OptimizerConfig:
    """Configuration for the AI Optimizer middleware. Env-overridable so ops
    can tune behavior without a redeploy."""

    enabled: bool = True
    max_prompt_chars: int = 60_000
    token_budget: int = 200_000
    prompt_cache_ttl_seconds: int = 3600
    response_cache_ttl_seconds: int = 600
    compression_level: int = 1  # 0=off, 1=whitespace+dedupe, 2=aggressive
    response_cache_enabled: bool = True
    semantic_cache_enabled: bool = True
    semantic_cache_similarity_threshold: float = 0.92
    semantic_cache_index_size: int = 200

    @classmethod
    def from_env(cls) -> "OptimizerConfig":
        return cls(
            enabled=os.getenv("AI_OPTIMIZER_ENABLED", "true").lower() != "false",
            max_prompt_chars=int(os.getenv("AI_OPTIMIZER_MAX_PROMPT_CHARS", "60000")),
            token_budget=int(os.getenv("AI_OPTIMIZER_TOKEN_BUDGET", "200000")),
            prompt_cache_ttl_seconds=int(os.getenv("AI_OPTIMIZER_PROMPT_CACHE_TTL", "3600")),
            response_cache_ttl_seconds=int(os.getenv("AI_OPTIMIZER_RESPONSE_CACHE_TTL", "600")),
            compression_level=int(os.getenv("AI_OPTIMIZER_COMPRESSION_LEVEL", "1")),
            response_cache_enabled=os.getenv("AI_OPTIMIZER_RESPONSE_CACHE_ENABLED", "true").lower() != "false",
            semantic_cache_enabled=os.getenv("AI_OPTIMIZER_SEMANTIC_CACHE_ENABLED", "true").lower() != "false",
            semantic_cache_similarity_threshold=float(os.getenv("AI_OPTIMIZER_SEMANTIC_CACHE_THRESHOLD", "0.92")),
            semantic_cache_index_size=int(os.getenv("AI_OPTIMIZER_SEMANTIC_CACHE_INDEX_SIZE", "200")),
        )


_config: OptimizerConfig | None = None


def get_optimizer_config() -> OptimizerConfig:
    global _config
    if _config is None:
        _config = OptimizerConfig.from_env()
    return _config


def set_optimizer_config(config: OptimizerConfig) -> None:
    global _config
    _config = config
