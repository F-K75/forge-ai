"""Phase 2 of docs/architecture/specialist-agent-execution-plan.md: the
first (and, by design, smallest possible) touch of specialist-agent
execution on `core/orchestrator.py` -- the live pipeline every paying
customer's build runs through.

This module implements exactly the "shadow comparison" described in the
plan's Phase 2: for blueprints with a clearly backend-only shape, ask a
`TaskRouter`-resolved backend specialist (via `AIGateway` directly, the same
pattern Phase 1 proved out in `agent_registry/monitoring.py`) what they
would have done differently, and log/record the comparison via existing
`agent_registry` infrastructure (`record_task_result`). It never merges
anything back into the real build's `files`, never re-emits any real build
WS event, and never charges credits.

Hard safety contract, enforced end-to-end in `maybe_run_specialist_shadow_
comparison` below:
- Callers MUST only invoke this after the real Developer stage has fully
  completed (files finalized/persisted, `_complete_agent` for
  `AgentType.DEVELOPER` already run, all real WS events for that stage
  already emitted) and MUST launch it via `asyncio.create_task(...)` --
  never awaited inline -- so it adds zero latency to the real build. See
  the call site in `core/orchestrator.py`'s Developer stage.
- Gated by the DB-backed `specialist_shadow_developer` feature flag
  (`core.feature_flags.is_feature_enabled`), default OFF, fail-closed --
  checked as the very first thing, before anything else runs.
- Read-only with respect to the real build: takes `blueprint`, `design`,
  and the already-finalized `files` dict as inputs only. Never writes back
  into them, never calls `persist_files`, never starts/completes an
  `AgentType.DEVELOPER` step, never emits a `WSEvent`.
- Everything is wrapped in one outer `try/except Exception` so any failure
  anywhere in this path (flag check, routing, the LLM call,
  `record_task_result`, anything) is fully swallowed and logged, never
  propagating anywhere the real build cares about.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Set

from agent_registry import get_agent_registry
from agent_registry.task_router import get_task_router
from core.feature_flags import is_feature_enabled
from core.models import Build
from gateway.models import GatewayRequest
from gateway.service import get_ai_gateway

logger = logging.getLogger(__name__)

# asyncio.create_task() only holds a WEAK reference to the task via the event
# loop's internal bookkeeping -- per the stdlib docs, a task with no other
# strong reference "may be garbage collected at any time, even before it's
# done." A build's local variables (blueprint/design/files) all go out of
# scope the moment run_build() returns, which can race a still-in-flight
# shadow task on a busy server. This module-level set holds a real reference
# for the task's lifetime; its own done-callback removes it once finished.
_inflight_tasks: Set["asyncio.Task[None]"] = set()


def launch_shadow_comparison(
    build: Build, blueprint: Dict[str, Any], design: Dict[str, Any], files: Dict[str, str]
) -> None:
    """Fire-and-forget launcher -- what `core/orchestrator.py`'s Developer
    stage actually calls. Wraps `asyncio.create_task` with the reference-
    retention fix described above so callers don't need to think about task
    lifetime; see `maybe_run_specialist_shadow_comparison` for the full
    safety contract this task runs under."""
    task = asyncio.create_task(maybe_run_specialist_shadow_comparison(build, blueprint, design, files))
    _inflight_tasks.add(task)
    task.add_done_callback(_inflight_tasks.discard)

# DB-backed feature_flags collection key (see core/feature_flags.py). Absent
# by default -- nothing creates this flag doc until an operator explicitly
# does so via the existing admin /admin/feature-flags UI.
FLAG_KEY = "specialist_shadow_developer"

# The real backend-department roles seeded in agent_registry/default_org.py.
# Anything else TaskRouter resolves to (frontend/ai/infra/qa/... or the
# generic "developer" fallback) is out of scope for this narrow shadow --
# skip rather than guess.
_BACKEND_ROLES = {"api_engineer", "database_engineer", "auth_engineer", "performance_engineer"}

# Bounded: this shadow call runs on every backend-shaped build once the flag
# is on, so cost matters -- kept modest since it's a comparison/second
# opinion, not a full file regeneration.
_SHADOW_MAX_TOKENS = 1024

# Simple heuristic for "files this backend specialist likely owns" -- used
# only to annotate the shadow's record_task_result call; never influences
# the real build or its file set.
_BACKEND_PATH_HINTS = ("backend/", "api/", "server/")


async def maybe_run_specialist_shadow_comparison(
    build: Build,
    blueprint: Dict[str, Any],
    design: Dict[str, Any],
    files: Dict[str, str],
) -> None:
    """Fire-and-forget entry point. See module docstring for the full safety
    contract -- in particular, callers must launch this via
    `asyncio.create_task(...)` after the real Developer stage has fully
    completed, and never await it inline."""
    try:
        if not await is_feature_enabled(FLAG_KEY):
            return

        router = get_task_router()
        assignments = await router.route(build.project_id, _blueprint_summary(blueprint))
        if not assignments:
            return

        assignment = assignments[0]
        if assignment.role not in _BACKEND_ROLES:
            return

        gateway = get_ai_gateway()
        response = await gateway.generate(
            GatewayRequest(
                agent_name=assignment.role,
                messages=[{"role": "user", "content": _comparison_prompt(blueprint, design, files)}],
                system_prompt=_system_prompt(assignment.role),
                # No user_id: this is an internal shadow comparison, not a
                # billed generation step for a specific user -- matches
                # Phase 1's monitoring._post_specialist_suggestion. project_id
                # is still passed so project-level budget limits still apply.
                project_id=build.project_id,
                max_tokens=_SHADOW_MAX_TOKENS,
            )
        )
        proposal = (response.content or "").strip()

        registry = get_agent_registry()
        agent, _created = await registry.get_or_create_agent(
            build.project_id, assignment.role, department=assignment.department
        )
        touched = [path for path in files if path.startswith(_BACKEND_PATH_HINTS)]
        await registry.record_task_result(
            build.project_id, agent.id, success=True, files_touched=touched,
        )

        logger.info(
            "specialist_shadow: build=%s role=%s files_touched=%d proposal=%s",
            build.id, assignment.role, len(touched),
            proposal[:300] if proposal else "(empty response)",
        )
    except Exception:
        logger.warning(
            "specialist_shadow: shadow comparison failed for build %s (swallowed, "
            "no impact on the real build)", build.id, exc_info=True,
        )


def _blueprint_summary(blueprint: Dict[str, Any]) -> str:
    """Short free-text summary handed to `TaskRouter.route`'s keyword
    classifier -- same "describe it in a sentence or two" shape Phase 1 uses
    for monitoring findings (`monitoring.py::_escalate`)."""
    parts: List[str] = []
    description = blueprint.get("description")
    if description:
        parts.append(str(description))
    tech_stack = blueprint.get("tech_stack")
    if tech_stack:
        parts.append(str(tech_stack))
    features = blueprint.get("features")
    if features:
        parts.append(", ".join(str(f) for f in features))
    endpoints = blueprint.get("api_endpoints")
    if endpoints:
        paths = [e.get("path", "") for e in endpoints if isinstance(e, dict) and e.get("path")]
        if paths:
            parts.append("API endpoints: " + ", ".join(paths))
    return " | ".join(parts) or "app"


def _system_prompt(role: str) -> str:
    return (
        f"You are a {role} on this project's engineering team, reviewing a build "
        "that was just generated by a generalist Developer agent. Given the app "
        "blueprint, design, and the files already generated, describe -- from "
        "your specialist perspective -- what backend files or approach you would "
        "have produced differently, if anything. Be concise (3-5 sentences). This "
        "is an internal second-opinion comparison only: do not restate full file "
        "contents, just the approach."
    )


def _comparison_prompt(blueprint: Dict[str, Any], design: Dict[str, Any], files: Dict[str, str]) -> str:
    file_paths = sorted(files.keys())
    theme = design.get("theme", "(none)") if isinstance(design, dict) else "(none)"
    return (
        f"App: {blueprint.get('app_name', '(unnamed)')}\n"
        f"Description: {blueprint.get('description', '(none)')}\n"
        f"Features: {blueprint.get('features', [])}\n"
        f"Integrations: {blueprint.get('integrations', [])}\n"
        f"Design theme: {theme}\n"
        f"Files already generated ({len(file_paths)}): {', '.join(file_paths[:40])}\n\n"
        "What would you, as this specialist, have done differently for the "
        "backend portion of this build?"
    )
