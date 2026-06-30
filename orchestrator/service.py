"""Top-level review coordinator.

Ties together loader -> context/trigger scoping -> runner -> consolidator ->
persistence, emitting progress events along the way. Designed to be launched
as a FastAPI background task; it owns the full lifecycle of one ``ReviewRun``.

This system NEVER edits files, opens PRs, or deploys — it only reads the repo
snapshot and emits findings.
"""
from __future__ import annotations

import logging
from typing import Optional

from .consolidator import consolidate
from .context import candidate_files
from .events import bus
from .loader import load_agents
from .models import (
    ReviewMode,
    ReviewRun,
    RunStatus,
)
from .runner import aggregate_usage, run_agents, select_triggered_agents
from .store import build_backlog_items, save_backlog_items, update_run

logger = logging.getLogger("review_board")


async def _emit(run_id: str, event: dict) -> None:
    event.setdefault("run_id", run_id)
    await bus.publish(run_id, event)


async def execute_review(run: ReviewRun, diff: Optional[str] = None) -> ReviewRun:
    """Run the full pipeline for ``run`` and persist results as it goes.

    ``diff`` is supplied separately (not stored on the run document) so the
    persisted record stays compact.
    """
    run_id = run.run_id
    # In diff mode an empty/absent diff means "nothing changed" -> no agents.
    diff = diff if run.mode == ReviewMode.diff else None
    try:
        agents = load_agents()
        files = candidate_files(run.repo_path, diff)

        triggered = select_triggered_agents(agents, files)
        run.triggered_agents = [a.id for a, _ in triggered]
        run.status = RunStatus.running
        await update_run(run)
        await _emit(
            run_id,
            {
                "type": "run_started",
                "mode": run.mode.value,
                "candidate_files": len(files),
                "triggered_agents": run.triggered_agents,
            },
        )

        reports = await run_agents(
            agents,
            run.repo_path,
            files,
            diff=diff,
            emit=lambda ev: _emit(run_id, ev),
        )
        run.agent_reports = reports
        usage, agent_cost = aggregate_usage(reports)
        await update_run(run)

        # --- Consolidation ---
        run.status = RunStatus.consolidating
        await update_run(run)
        await _emit(run_id, {"type": "consolidating", "reports": len(reports)})

        consolidated, cto_cost = await consolidate(reports)
        run.consolidated = consolidated
        run.total_tokens = usage.total
        run.total_cost_usd = round(agent_cost + cto_cost, 6)
        run.status = RunStatus.complete
        await update_run(run)

        # --- Backlog ---
        items = build_backlog_items(run_id, consolidated)
        await save_backlog_items(items)

        await _emit(
            run_id,
            {
                "type": "complete",
                "overall_score": consolidated.overall_score,
                "recommendation": consolidated.recommendation.value,
                "backlog_items": len(items),
                "total_cost_usd": run.total_cost_usd,
                "total_tokens": run.total_tokens,
            },
        )
    except Exception as exc:  # pragma: no cover - defensive top-level guard
        logger.exception("Review run %s failed", run_id)
        run.status = RunStatus.failed
        run.error = f"{type(exc).__name__}: {exc}"
        await update_run(run)
        await _emit(run_id, {"type": "error", "error": run.error})
    return run
