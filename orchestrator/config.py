"""Environment-driven settings for the Review Board orchestrator.

All secrets (API keys, DB URLs) come from env vars — never hard-coded.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List, Union

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    # --- Provider API keys (read from env; never commit real values) ---
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    deepseek_api_key: str = ""

    # --- Persistence ---
    mongodb_url: str = "mongodb://localhost:27017/forge"
    mongodb_db: str = "forge_review"

    # --- CORS ---
    # Union with str lets pydantic-settings fall back to the raw env value when
    # it isn't JSON, so both JSON arrays and comma-separated strings work.
    allowed_origins: Union[List[str], str] = ["http://localhost:3000", "http://localhost:5173"]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_allowed_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # --- Agent loading ---
    # Directory holding the agent *.json definitions. Relative paths are
    # resolved against the repo root (the parent of this package).
    agents_dir: str = "agents"

    # --- Runner behaviour ---
    max_concurrency: int = 5
    max_retries: int = 3
    retry_base_delay: float = 1.0  # seconds; doubled each attempt
    agent_max_output_tokens: int = 4096
    request_timeout: int = 120

    # --- Context builder ---
    # Hard ceiling on input tokens fed to a single agent call.
    max_input_tokens: int = 100_000
    # Reserve headroom for the system prompt + JSON wrapper overhead.
    context_token_reserve: int = 4_000
    max_file_tree_entries: int = 2_000

    # --- Consolidator ("CTO" agent) ---
    consolidator_model: str = "claude-sonnet-4-6"
    consolidator_max_output_tokens: int = 8192

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
