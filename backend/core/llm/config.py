from __future__ import annotations

import logging
import os
from core.models import utcnow
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

from core.config import get_settings

logger = logging.getLogger(__name__)


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
    "policy": {
        "approved_providers": None,
        "approved_models": None,
        "max_tokens_per_request": None,
        "max_cost_per_request_usd": None,
        "guardrails_enabled": True,
        # None = use GuardrailsEngine's baseline categories. A configured
        # list is ADDITIVE to the baseline, not a replacement -- an org/
        # agent can widen coverage but can't silently disable the safety
        # floor by omitting a baseline category.
        "blocked_categories": None,
        # An optional `guardrail` sub-block holds the guardrail v2 policy
        # (core/llm/guardrail_policy.py). Absent = the shipped default:
        # D-tier everywhere, L-tier off (§4.4).
    },
    # Dedicated model for the output L-tier screen (§4.2): one bounded call
    # per artifact on a lower-cost, explicitly priced model -- never the
    # calling agent's own model (F26). Overridable in config/llm.yaml.
    "guardrail_screen": {
        "provider": "openrouter",
        "model": "anthropic/claude-haiku-4.5",
    },
}


class LLMConfigLoader:
    """Loads router configuration from YAML, env vars, and simple DB overrides."""

    def __init__(self, config_path: Optional[Path] = None) -> None:
        self.settings = get_settings()
        self.config_path = config_path or Path(__file__).resolve().parents[2] / "config" / "llm.yaml"
        self._config = self._load_from_disk()
        # Process-local cache of the MongoDB-backed per-agent overrides
        # (collection `llm_agent_overrides`), keyed by agent name to
        # {"provider": ..., "model": ...}. Populated ONLY by an explicit
        # refresh_db_overrides() call (at startup pre-warm, on
        # set_agent_override(), and on reload()) -- never by load() itself,
        # since load() runs on every single agent LLM call and must stay a
        # pure in-memory read with zero I/O.
        self._db_overrides: Dict[str, Dict[str, Any]] = {}
        # Process-local cache of the MongoDB-backed per-org policy overrides
        # (collection `llm_org_policy_overrides`), keyed by org_id to a
        # `policy` dict. Same fail-open, explicit-refresh-only discipline as
        # `_db_overrides` above.
        self._org_policy_overrides: Dict[str, Dict[str, Any]] = {}

    async def load(self, *, agent_name: Optional[str] = None, org_id: Optional[str] = None) -> Dict[str, Any]:
        config = dict(self._config)
        if org_id:
            # Org-level policy sits between the global default and any
            # per-agent policy override -- more specific (agent) wins over
            # less specific (org), matching the shallow-merge precedence
            # already used for agent_overrides/db_overrides below.
            org_policy = self._org_policy_overrides.get(org_id)
            if org_policy:
                config["policy"] = org_policy
        if agent_name:
            agent_override = config.get("agent_overrides", {}).get(agent_name, {})
            if agent_override:
                config.update(agent_override)
            # DB overrides win over YAML/env-file overrides for the same
            # agent, since the DB is the live/admin-editable layer -- but
            # this is purely reading the already-populated in-memory dict,
            # no I/O happens here.
            db_override = self._db_overrides.get(agent_name)
            if db_override:
                config.update(db_override)
        config.setdefault("default_provider", "anthropic")
        config.setdefault("fallback_chain", [config["default_provider"]])
        config.setdefault("retry", {"max_attempts": 2, "backoff_seconds": 0.25})
        config.setdefault("timeout_seconds", 120)
        config.setdefault("cache_ttl_seconds", 300)
        config.setdefault("policy", {})
        return config

    def get_org_policy(self, org_id: str) -> Dict[str, Any]:
        """Zero-I/O read of the in-memory org policy cache, for callers
        (e.g. the rate limiter) that need just the org override without a
        full load() -- same underlying cache load() itself reads."""
        return self._org_policy_overrides.get(org_id, {})

    async def reload(self) -> Dict[str, Any]:
        self._config = self._load_from_disk()
        # Also refresh the DB-backed overrides so POST /api/llm/reload picks
        # up admin edits made on *another* process. An override written via
        # set_agent_override() on THIS process is already reflected on its
        # very next load() call with no reload needed (see
        # set_agent_override below) -- but in a multi-process deployment,
        # other replicas only learn about that write via their own explicit
        # reload() call (or a restart), not instantly. True cluster-wide
        # instant propagation would need pub/sub (e.g. Redis keyspace
        # notifications / a change stream) and is intentionally out of
        # scope here -- this is the same eventual-consistency tradeoff this
        # repo already accepts for the feature-flags cache (see
        # api/admin.py's FEATURE_FLAGS_CACHE_TTL, which is also only
        # eventually consistent across replicas, not instant).
        await self.refresh_db_overrides()
        await self.refresh_org_policy_overrides()
        return await self.load()

    async def refresh_db_overrides(self) -> None:
        """Pull the live, admin-editable per-agent overrides from MongoDB
        into the in-memory `_db_overrides` cache.

        This is the ONLY place this class talks to Mongo. It is never
        called from load() (which runs on every LLM call and must stay
        zero-I/O) -- only from an explicit reload(), the app startup
        pre-warm, or right after set_agent_override() writes a change.

        Fails open: if Mongo is unreachable or the query errors for any
        reason, we log a warning and leave `_db_overrides` exactly as it
        was -- we never clear it to `{}` on a transient failure, since that
        would make a momentary DB blip look like every admin override was
        reset.
        """
        try:
            from core.database import get_db

            db = await get_db()
            overrides: Dict[str, Dict[str, Any]] = {}
            async for doc in db.llm_agent_overrides.find({}):
                entry = {key: doc[key] for key in ("provider", "model", "policy") if doc.get(key) is not None}
                if entry and doc.get("agent"):
                    overrides[doc["agent"]] = entry
            self._db_overrides = overrides
        except Exception as exc:
            logger.warning("Failed to refresh LLM agent overrides from MongoDB: %s", exc)

    async def refresh_org_policy_overrides(self) -> None:
        """Pull the live, admin-editable per-org policy overrides from
        MongoDB into the in-memory `_org_policy_overrides` cache. Mirrors
        `refresh_db_overrides()` exactly: never called from `load()`, fails
        open (never clears the cache to `{}` on a transient error)."""
        try:
            from core.database import get_db

            db = await get_db()
            overrides: Dict[str, Dict[str, Any]] = {}
            async for doc in db.llm_org_policy_overrides.find({}):
                policy = doc.get("policy")
                if policy and doc.get("org_id"):
                    overrides[doc["org_id"]] = policy
            self._org_policy_overrides = overrides
        except Exception as exc:
            logger.warning("Failed to refresh LLM org policy overrides from MongoDB: %s", exc)

    async def set_org_policy_override(
        self, org_id: str, policy: Dict[str, Any], updated_by: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            from core.database import get_db

            db = await get_db()
            await db.llm_org_policy_overrides.update_one(
                {"org_id": org_id},
                {"$set": {"org_id": org_id, "policy": policy, "updated_by": updated_by, "updated_at": utcnow()}},
                upsert=True,
            )
        except Exception as exc:
            logger.warning("Failed to persist LLM org policy override for %s to MongoDB: %s", org_id, exc)

        # Reflect immediately in this process's in-memory cache, same as
        # set_agent_override() -- the writer's own next load() call sees it
        # with no reload()/restart needed.
        merged = {**self._org_policy_overrides.get(org_id, {}), **policy}
        self._org_policy_overrides[org_id] = merged
        return merged

    async def set_agent_override(
        self, agent_name: str, override: Dict[str, Any], updated_by: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            from core.database import get_db

            db = await get_db()
            await db.llm_agent_overrides.update_one(
                {"agent": agent_name},
                {"$set": {"agent": agent_name, **override, "updated_by": updated_by, "updated_at": utcnow()}},
                upsert=True,
            )
        except Exception as exc:
            # Degrade to in-memory-only for this call, matching today's
            # behavior, rather than failing the admin's request just
            # because Mongo happens to be unavailable.
            logger.warning("Failed to persist LLM agent override for %s to MongoDB: %s", agent_name, exc)

        # Regardless of whether the DB write succeeded, reflect the change
        # in this process's in-memory cache immediately, so the very next
        # load(agent_name=...) call in THIS process sees it with no
        # reload()/restart needed.
        merged = {**self._db_overrides.get(agent_name, {}), **override}
        self._db_overrides[agent_name] = merged
        return merged

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
