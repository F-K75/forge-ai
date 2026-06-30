"""Load and validate agent definitions from ``agents/*.json``.

Acceptance criterion #1: dropping a new valid JSON into the agents
directory makes it part of runs with zero code changes. This module is the
only place agents are discovered, so that property holds automatically.
"""
from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from .config import get_settings
from .models import AgentConfig


class AgentConfigError(Exception):
    """Raised when an agent JSON file is missing or schema-invalid."""


def _repo_root() -> Path:
    # orchestrator/ lives directly under the repo root.
    return Path(__file__).resolve().parent.parent


def resolve_agents_dir(agents_dir: str | None = None) -> Path:
    settings = get_settings()
    raw = agents_dir or settings.agents_dir
    p = Path(raw)
    if not p.is_absolute():
        p = _repo_root() / p
    return p


def load_agents(agents_dir: str | None = None) -> list[AgentConfig]:
    """Read every ``*.json`` in the agents directory into AgentConfig.

    Fails loudly: a malformed file, duplicate id, or schema violation
    raises ``AgentConfigError`` rather than being silently skipped.
    """
    directory = resolve_agents_dir(agents_dir)
    if not directory.is_dir():
        raise AgentConfigError(f"Agents directory not found: {directory}")

    files = sorted(directory.glob("*.json"))
    if not files:
        raise AgentConfigError(f"No agent JSON files found in {directory}")

    agents: list[AgentConfig] = []
    seen_ids: dict[str, Path] = {}

    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise AgentConfigError(f"Invalid JSON in {path.name}: {exc}") from exc

        try:
            cfg = AgentConfig.model_validate(data)
        except ValidationError as exc:
            raise AgentConfigError(
                f"Schema validation failed for {path.name}:\n{exc}"
            ) from exc

        if cfg.id in seen_ids:
            raise AgentConfigError(
                f"Duplicate agent id '{cfg.id}' in {path.name} "
                f"(already defined in {seen_ids[cfg.id].name})"
            )
        seen_ids[cfg.id] = path
        agents.append(cfg)

    # Stable ordering by stage then id for deterministic runs.
    agents.sort(key=lambda a: (a.stage, a.id))
    return agents
