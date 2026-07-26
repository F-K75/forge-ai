"""Review Board bridge: best-effort glue between `agent_registry`'s
`ChangeRequest` lifecycle and the standalone `orchestrator/` Review Board
microservice.

See `docs/architecture/review-board-reconciliation-proposal.md`, option (b),
scoped narrowly to a single review stage -- this is that proof of concept.

When a `ChangeRequest` reaches `SECURITY_REVIEW`, `trigger_security_review()`
materializes the project's most recent `Build` to a temp directory on disk,
kicks off a full-repo `POST /reviews` run against orchestrator's
`security_engineer` LLM reviewer, and -- once that run finishes -- posts the
result as a `TeamChat` `FINDING` message for a human to read.

Hard boundaries, deliberately:
- `orchestrator/` is never imported, written to, or otherwise touched here --
  it's called over plain HTTP exactly like the frontend already does
  (`frontend/src/lib/orchestratorApi.ts`), and stays a read-only, externally
  deployed service this module knows nothing about beyond its API shape.
- This module NEVER calls `PRWorkflow.submit_review()` or otherwise
  auto-approves/auto-rejects anything. A `ConsolidatedReport.recommendation`
  is posted as information (a `FINDING`), not a decision -- a human still
  has to act on it through the existing review API.
- Every public entry point is best-effort: materializing the snapshot,
  reaching orchestrator, and posting the finding can all fail (no build yet,
  network error, timeout, orchestrator down) without ever raising back into
  the caller. `pr_workflow.PRWorkflow.advance()` *additionally* wraps its
  call to `trigger_security_review()` in its own try/except, matching the
  file's established fail-open style for external side effects (WS event
  emission, etc.) -- this module's internal robustness is defense in depth,
  not a substitute for that belt-and-suspenders wrapping.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Optional, Set

import httpx

from core.config import get_settings
from core.database import get_db
from core.models import Build, BuildFile

from .registry import get_agent_registry
from .team_chat import MessageType, get_team_chat

logger = logging.getLogger(__name__)

# asyncio.create_task() only holds a WEAK reference to the task via the event
# loop's internal bookkeeping -- per the stdlib docs, a task with no other
# strong reference "may be garbage collected at any time, even before it's
# done." `trigger_security_review()`'s local variables all go out of scope
# the moment it returns (it never awaits the poll itself), which can race a
# still-in-flight `_poll_and_post` task on a busy server. This module-level
# set holds a real reference for the task's lifetime; its own done-callback
# removes it once finished.
_inflight_tasks: Set["asyncio.Task[None]"] = set()


def _launch_poll_and_post(
    project_id: str, cr_id: str, run_id: str, repo_path: str, orchestrator_url: str
) -> None:
    """Fire-and-forget launcher for `_poll_and_post` -- wraps
    `asyncio.create_task` with the reference-retention fix described above so
    `trigger_security_review` doesn't need to think about task lifetime."""
    task = asyncio.create_task(
        _poll_and_post(project_id, cr_id, run_id, repo_path, orchestrator_url)
    )
    _inflight_tasks.add(task)
    task.add_done_callback(_inflight_tasks.discard)


# The one orchestrator reviewer that exists today (agents/security_engineer.json
# at the repo root) happens to share its id with a role already seeded into
# every project's default org (default_org.py, infrastructure department) --
# reuse that real, registered AgentProfile as the poster identity instead of
# inventing a synthetic one (TeamChat.post() raises UnknownAgent for anything
# that isn't a real agent in the project).
REVIEWER_ROLE = "security_engineer"

# Poll cadence / overall budget for a background orchestrator review run.
# Generous enough for a real multi-agent LLM review; bounded so a stuck
# orchestrator run can't be polled forever.
POLL_INTERVAL_SECONDS = 8.0
POLL_TIMEOUT_SECONDS = 600.0  # ~10 minutes
_HTTP_TIMEOUT_SECONDS = 15.0

# Mirrors orchestrator.models.RunStatus's terminal values as plain strings
# rather than importing them -- orchestrator/ is a standalone service with
# its own dependency tree, not a library this backend depends on.
_TERMINAL_STATUSES = {"complete", "failed"}


async def trigger_security_review(project_id: str, cr_id: str) -> None:
    """Entry point `PRWorkflow.advance()` calls when a `ChangeRequest`
    reaches `SECURITY_REVIEW`.

    Materializes the project's latest build and fires the (fast, 202)
    `POST /reviews` synchronously -- both are quick -- then hands polling
    for the real result off to a background task so this never delays the
    stage transition that triggered it. Swallows every failure internally;
    see the module docstring for the full fail-open contract.
    """
    settings = get_settings()
    repo_path: Optional[str] = None
    try:
        repo_path = await _materialize_repo_snapshot(project_id)
        if repo_path is None:
            logger.info(
                "review_board_bridge: no build to snapshot for project %s, "
                "skipping security review trigger for cr %s",
                project_id, cr_id,
            )
            return

        run_id = await _start_review(settings.orchestrator_url, repo_path)
    except Exception:
        logger.warning(
            "review_board_bridge: failed to start orchestrator review for "
            "cr %s in project %s", cr_id, project_id, exc_info=True,
        )
        if repo_path:
            shutil.rmtree(repo_path, ignore_errors=True)
        return

    _launch_poll_and_post(project_id, cr_id, run_id, repo_path, settings.orchestrator_url)


async def _materialize_repo_snapshot(project_id: str) -> Optional[str]:
    """Write the project's most recent `Build`'s files to a fresh temp
    directory and return its path (the caller owns cleanup), or `None` if
    the project has no build yet, or that build has no files."""
    db = await get_db()

    cursor = db["builds"].find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).limit(1)
    builds = await cursor.to_list(length=1)
    if not builds:
        return None
    build = Build(**builds[0])

    files = await db["build_files"].find({"build_id": build.id}, {"_id": 0}).to_list(length=None)
    if not files:
        return None

    tmp_dir = tempfile.mkdtemp(prefix="forge_review_")
    try:
        root = Path(tmp_dir).resolve()
        for doc in files:
            bf = BuildFile(**doc)
            rel = Path(bf.path)
            if rel.is_absolute() or ".." in rel.parts:
                # Never trust a stored path enough to write outside the
                # snapshot directory it's confined to.
                continue
            dest = (root / rel).resolve()
            if dest != root and root not in dest.parents:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(bf.content, encoding="utf-8")
        return tmp_dir
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise


async def _start_review(orchestrator_url: str, repo_path: str) -> str:
    """POST /reviews in full mode; returns run_id. Raises on any failure --
    caller (trigger_security_review) is responsible for catching it."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            f"{orchestrator_url}/reviews",
            json={"repo_path": repo_path, "mode": "full"},
        )
        resp.raise_for_status()
        return resp.json()["run_id"]


async def _poll_and_post(
    project_id: str, cr_id: str, run_id: str, repo_path: str, orchestrator_url: str
) -> None:
    """Background task: poll until the orchestrator run is terminal (or the
    timeout is hit), post a TeamChat FINDING with the result, and always
    clean up the temp snapshot directory -- whatever happens."""
    try:
        run_data = await _poll_until_terminal(orchestrator_url, run_id)
        if run_data is not None:
            await _post_finding(project_id, cr_id, run_id, run_data)
    except Exception:
        logger.exception(
            "review_board_bridge: background poll/post failed for cr %s run %s",
            cr_id, run_id,
        )
    finally:
        shutil.rmtree(repo_path, ignore_errors=True)


async def _poll_until_terminal(orchestrator_url: str, run_id: str) -> Optional[Dict[str, Any]]:
    """Poll GET /reviews/{run_id} until `status` is terminal or the overall
    timeout elapses. Transient request errors are logged and retried rather
    than aborting the poll early -- a single dropped connection shouldn't
    throw away an otherwise-completing review."""
    deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
        while True:
            try:
                resp = await client.get(f"{orchestrator_url}/reviews/{run_id}")
                resp.raise_for_status()
                data = resp.json()
                if data.get("status") in _TERMINAL_STATUSES:
                    return data
            except Exception:
                logger.debug(
                    "review_board_bridge: transient error polling run %s", run_id, exc_info=True,
                )

            if time.monotonic() >= deadline:
                logger.warning(
                    "review_board_bridge: gave up polling orchestrator run %s after timeout", run_id,
                )
                return None
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def _post_finding(project_id: str, cr_id: str, run_id: str, run_data: Dict[str, Any]) -> None:
    registry = get_agent_registry()
    reviewer, _created = await registry.get_or_create_agent(project_id, REVIEWER_ROLE)

    chat = get_team_chat()
    await chat.post(
        project_id,
        reviewer.id,
        _finding_content(run_id, run_data),
        message_type=MessageType.FINDING,
        context={"change_request_id": cr_id, "orchestrator_run_id": run_id},
    )


def _finding_content(run_id: str, run_data: Dict[str, Any]) -> str:
    status = run_data.get("status")
    consolidated = run_data.get("consolidated")
    if status != "complete" or not consolidated:
        error = run_data.get("error") or f"run ended with status={status}"
        return (
            f"Automated security review (orchestrator run {run_id}) did not "
            f"produce a usable result: {error}. No automated recommendation "
            f"is available for this change -- please review manually."
        )

    recommendation = consolidated.get("recommendation", "NO_GO")
    summary = consolidated.get("summary") or "(no summary provided)"
    return (
        f"Automated security review (orchestrator run {run_id}): "
        f"recommendation={recommendation}. {summary}\n\n"
        "This is an automated finding only -- not an approval or rejection. "
        "A human reviewer must still submit the actual review decision via "
        "the normal review flow."
    )
