from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict


@dataclass
class OptimizerConfig:
    """Configuration for the AI Optimizer middleware. Env-overridable so ops
    can tune behavior without a redeploy.

    compression_level:
        0 = no optimization
        1 = basic: dedupe, strip metadata, truncate to budget
        2 = enhanced: + semantic dedupe, merge system messages, dedupe tool calls
        3 = aggressive: + compress tool results, preserve recent turns, language compression
    """

    enabled: bool = True
    max_prompt_chars: int = 60_000
    token_budget: int = 200_000
    prompt_cache_ttl_seconds: int = 3600
    response_cache_ttl_seconds: int = 600
    compression_level: int = 2  # 0=off, 1=basic, 2=enhanced (default), 3=aggressive
    response_cache_enabled: bool = True
    semantic_cache_enabled: bool = True
    semantic_cache_similarity_threshold: float = 0.92
    semantic_cache_index_size: int = 200

    # New: preserve the most recent N turns during truncation to maintain
    # conversational continuity even under aggressive budget constraints
    preserve_recent_turns: int = 5

    # New: max characters for tool result content before truncation
    max_tool_result_chars: int = 2000

    # New: per-role max prompt char overrides for fine-grained control
    role_max_prompt_chars: Dict[str, int] = field(default_factory=lambda: {
        "architect": 80_000,     # Architects need more context for system design
        "developer": 100_000,    # Developers need the most context for code generation
        "task_executor": 30_000, # Task executors need minimal context
        "qa": 40_000,            # QA needs moderate context
        "security": 40_000,      # Security needs moderate context
    })

    @classmethod
    def from_env(cls) -> "OptimizerConfig":
        return cls(
            enabled=os.getenv("AI_OPTIMIZER_ENABLED", "true").lower() != "false",
            max_prompt_chars=int(os.getenv("AI_OPTIMIZER_MAX_PROMPT_CHARS", "60000")),
            token_budget=int(os.getenv("AI_OPTIMIZER_TOKEN_BUDGET", "200000")),
            prompt_cache_ttl_seconds=int(os.getenv("AI_OPTIMIZER_PROMPT_CACHE_TTL", "3600")),
            response_cache_ttl_seconds=int(os.getenv("AI_OPTIMIZER_RESPONSE_CACHE_TTL", "600")),
            compression_level=int(os.getenv("AI_OPTIMIZER_COMPRESSION_LEVEL", "2")),
            response_cache_enabled=os.getenv("AI_OPTIMIZER_RESPONSE_CACHE_ENABLED", "true").lower() != "false",
            semantic_cache_enabled=os.getenv("AI_OPTIMIZER_SEMANTIC_CACHE_ENABLED", "true").lower() != "false",
            semantic_cache_similarity_threshold=float(os.getenv("AI_OPTIMIZER_SEMANTIC_CACHE_THRESHOLD", "0.92")),
            semantic_cache_index_size=int(os.getenv("AI_OPTIMIZER_SEMANTIC_CACHE_INDEX_SIZE", "200")),
            preserve_recent_turns=int(os.getenv("AI_OPTIMIZER_PRESERVE_RECENT_TURNS", "5")),
            max_tool_result_chars=int(os.getenv("AI_OPTIMIZER_MAX_TOOL_RESULT_CHARS", "2000")),
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