"""Fleet summary for the Command Center home page.

Builds the stat tiles (current value plus a comparison value) and the recent
activity feed across every project the caller can access, from records that
are already persisted:

- ``kernel_runs`` -- run start/finish timestamps, per-task start/finish
  timestamps, approval gates (created/decided) and skill activations.
  Runs executing in *this* process are overlaid from the in-memory kernel,
  because the repository only saves a run when it is launched and when it
  finishes.
- ``ai_usage`` -- per-LLM-call cost records (project-scoped).
- ``budget_limits`` (via the budget manager's cache) -- project daily limits.
- ``deployments`` -- deploy start / live / failed events.

Every comparison is either derived from those timestamps or returned as
``None`` with an ``unavailable_reason``; nothing is estimated or invented.

Query cost is bounded: at most ``MAX_PROJECTS`` projects, a ``LOOKBACK``
window of runs/deployments, and hard caps on the number of documents read.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

# Comparison windows.
DAY = timedelta(hours=24)
AGENTS_COMPARE_OFFSET = timedelta(hours=1)
# How far back run/deployment history is read. Needs to cover the prior 24h
# skill window (48h) plus slack for runs that were already in flight then.
LOOKBACK = timedelta(hours=72)

# Query-cost bounds.
MAX_PROJECTS = 50
MAX_ORG_MEMBERSHIPS = 200
MAX_RUNS = 1000
MAX_DEPLOYMENTS = 100
ACTIVITY_LIMIT = 20

ACTIVE_RUN_STATUSES = frozenset({"planned", "running", "waiting_approval"})
FAILED_RUN_STATUSES = frozenset({"failed", "partial_failure"})

# Fields read from kernel_runs -- skips artifacts, outputs, traces, etc.
RUN_PROJECTION: Dict[str, int] = {
    "_id": 0,
    "id": 1,
    "project_id": 1,
    "objective": 1,
    "status": 1,
    "created_at": 1,
    "started_at": 1,
    "finished_at": 1,
    "tasks.id": 1,
    "tasks.role": 1,
    "tasks.status": 1,
    "tasks.started_at": 1,
    "tasks.finished_at": 1,
    "approval_gates": 1,
    "skill_activations.task_id": 1,
    "skill_activations.skill_name": 1,
    "skill_activations.activated_at": 1,
    "config.max_budget_usd": 1,
}

# Reasons a comparison value is ``None``.
REASON_NOT_COMPARED = "not_compared"
REASON_NO_BASELINE = "no_baseline"
REASON_HISTORY_TRUNCATED = "history_truncated"


# --------------------------------------------------------------------------- #
# Time helpers
# --------------------------------------------------------------------------- #


def parse_ts(value: Any) -> Optional[datetime]:
    """Parse a persisted timestamp (aware/naive datetime or ISO string) to aware UTC."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _naive(dt: datetime) -> datetime:
    """``ai_usage`` / ``deployments`` store naive UTC datetimes."""
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


# --------------------------------------------------------------------------- #
# Scoping
# --------------------------------------------------------------------------- #


async def accessible_projects(db, user_id: str) -> Tuple[List[Dict[str, Any]], bool]:
    """Projects ``user_id`` can access, most recently updated first.

    Same rule as ``core.permissions.has_project_access``: the caller owns the
    project, or is a member (any role) of the project's org. Returns at most
    ``MAX_PROJECTS`` projects and whether the list was truncated.
    """
    memberships = await db.team_members.find(
        {"user_id": user_id}, {"_id": 0, "org_id": 1}
    ).to_list(length=MAX_ORG_MEMBERSHIPS)
    org_ids = sorted({m["org_id"] for m in memberships if m.get("org_id")})

    clauses: List[Dict[str, Any]] = [{"user_id": user_id}]
    if org_ids:
        clauses.append({"org_id": {"$in": org_ids}})
    cursor = (
        db.projects.find(
            {"deleted_at": None, "$or": clauses},
            {"_id": 0, "id": 1, "name": 1, "user_id": 1, "org_id": 1},
        )
        .sort("updated_at", -1)
        .limit(MAX_PROJECTS + 1)
    )
    docs = await cursor.to_list(length=MAX_PROJECTS + 1)
    return docs[:MAX_PROJECTS], len(docs) > MAX_PROJECTS


# --------------------------------------------------------------------------- #
# Run model helpers
# --------------------------------------------------------------------------- #


def _is_current_active(run: Dict[str, Any], live_ids: Set[str]) -> bool:
    if run.get("id") in live_ids:
        return True
    return run.get("status") in ACTIVE_RUN_STATUSES and not run.get("finished_at")


def _run_start(run: Dict[str, Any]) -> Optional[datetime]:
    return parse_ts(run.get("started_at")) or parse_ts(run.get("created_at"))


def _run_active_at(run: Dict[str, Any], t: datetime, current_active: bool) -> bool:
    start = _run_start(run)
    if start is None or start > t:
        return False
    end = parse_ts(run.get("finished_at"))
    if end is not None:
        return end > t
    # No finish time: it has been active since it started iff it still is.
    return current_active


def _working_agents_at(runs: Iterable[Tuple[Dict[str, Any], bool]], t: datetime) -> int:
    """Distinct (run, role) pairs with a task executing at ``t``."""
    working: Set[str] = set()
    for run, current_active in runs:
        for task in run.get("tasks") or []:
            started = parse_ts(task.get("started_at"))
            if started is None or started > t:
                continue
            finished = parse_ts(task.get("finished_at"))
            if finished is not None:
                active = finished > t
            else:
                active = current_active and task.get("status") == "running"
            if active:
                working.add(f"{run.get('id')}:{task.get('role')}")
    return len(working)


def _skill_timestamps(run: Dict[str, Any]) -> List[datetime]:
    task_starts = {
        t.get("id"): parse_ts(t.get("started_at")) for t in run.get("tasks") or []
    }
    fallback = _run_start(run)
    out: List[datetime] = []
    for act in run.get("skill_activations") or []:
        # Older runs predate ``activated_at``; routing happens immediately
        # before the task starts, so the task start is the activation time.
        ts = parse_ts(act.get("activated_at")) or task_starts.get(act.get("task_id")) or fallback
        if ts is not None:
            out.append(ts)
    return out


def _comparison(
    current: int,
    previous: Optional[int],
    compared_to: Optional[str],
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "current": current,
        "previous": previous,
        "delta": (current - previous) if previous is not None else None,
        "compared_to": compared_to,
        "unavailable_reason": None if previous is not None else reason,
    }


def _short_title(objective: str) -> str:
    first = (objective or "").split("\n")[0].split(". ")[0].strip()
    return first if len(first) <= 64 else f"{first[:61]}…"


# --------------------------------------------------------------------------- #
# Spend
# --------------------------------------------------------------------------- #


async def _sum_cost(db, project_ids: List[str], start: datetime, end: datetime) -> float:
    pipeline = [
        {
            "$match": {
                "project_id": {"$in": project_ids},
                "created_at": {"$gte": _naive(start), "$lt": _naive(end)},
            }
        },
        {"$group": {"_id": None, "cost": {"$sum": "$cost"}}},
    ]
    rows = [row async for row in db.ai_usage.aggregate(pipeline)]
    return round(float(rows[0].get("cost") or 0.0), 6) if rows else 0.0


async def _project_daily_budget(budget_manager, project_ids: List[str]) -> Optional[float]:
    """Sum of configured *daily* project limits (hard, else soft); None if none set."""
    if budget_manager is None:
        return None
    from core.llm.budget_manager import BudgetScope

    total = 0.0
    configured = False
    for pid in project_ids:
        limit = await budget_manager.get_limit(BudgetScope.PROJECT, pid)
        if not limit or limit.get("period") != "daily":
            continue
        value = limit.get("hard_limit_usd")
        if value is None:
            value = limit.get("soft_limit_usd")
        if value is None:
            continue
        configured = True
        total += float(value)
    return round(total, 6) if configured else None


# --------------------------------------------------------------------------- #
# Activity
# --------------------------------------------------------------------------- #


def _run_events(run: Dict[str, Any], project_name: str) -> List[Dict[str, Any]]:
    run_id = run.get("id")
    base = {
        "project_id": run.get("project_id"),
        "project_name": project_name,
        "run_id": run_id,
    }
    title = _short_title(run.get("objective") or "")
    events: List[Dict[str, Any]] = []

    started = _run_start(run)
    if started is not None:
        events.append({**base, "id": f"{run_id}:start", "kind": "run_started", "at": started,
                       "title": title, "actor": None})
    finished = parse_ts(run.get("finished_at"))
    if finished is not None:
        status = run.get("status")
        kind = (
            "run_failed" if status in FAILED_RUN_STATUSES
            else "run_cancelled" if status == "cancelled"
            else "run_completed"
        )
        events.append({**base, "id": f"{run_id}:end", "kind": kind, "at": finished,
                       "title": title, "actor": None})

    for gate in run.get("approval_gates") or []:
        gate_id = gate.get("gate_id")
        opened = parse_ts(gate.get("created_at"))
        if opened is not None:
            events.append({**base, "id": f"{run_id}:{gate_id}:open", "kind": "gate_opened",
                           "at": opened, "title": gate.get("gate_name") or "", "actor": None})
        decided = parse_ts(gate.get("decided_at"))
        if decided is not None and gate.get("status") in ("approved", "rejected"):
            events.append({
                **base,
                "id": f"{run_id}:{gate_id}:decided",
                "kind": "gate_approved" if gate.get("status") == "approved" else "gate_rejected",
                "at": decided,
                "title": gate.get("gate_name") or "",
                "actor": gate.get("decided_by") or None,
            })
    return events


def _deployment_events(dep: Dict[str, Any], project_name: str) -> List[Dict[str, Any]]:
    dep_id = dep.get("id")
    base = {
        "project_id": dep.get("project_id"),
        "project_name": project_name,
        "run_id": None,
        "deployment_id": dep_id,
        "actor": None,
    }
    title = dep.get("url") or dep.get("target_type") or dep.get("provider") or "deployment"
    events: List[Dict[str, Any]] = []
    created = parse_ts(dep.get("created_at"))
    if created is not None:
        events.append({**base, "id": f"{dep_id}:deploy", "kind": "deploy_started", "at": created,
                       "title": title})
    status = getattr(dep.get("status"), "value", dep.get("status"))
    if status == "live":
        live_at = parse_ts(dep.get("deployed_at")) or parse_ts(dep.get("updated_at"))
        if live_at is not None:
            events.append({**base, "id": f"{dep_id}:live", "kind": "deploy_live", "at": live_at,
                           "title": title})
    elif status == "failed":
        failed_at = parse_ts(dep.get("updated_at"))
        if failed_at is not None:
            events.append({**base, "id": f"{dep_id}:failed", "kind": "deploy_failed", "at": failed_at,
                           "title": title})
    return events


# --------------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------------- #


async def build_command_center_summary(
    db,
    user_id: str,
    *,
    kernel=None,
    budget_manager=None,
    now: Optional[datetime] = None,
    window: str = "24h",
) -> Dict[str, Any]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    projects, projects_truncated = await accessible_projects(db, user_id)
    project_ids = [p["id"] for p in projects]
    names = {p["id"]: p.get("name") or p["id"] for p in projects}
    allowed = set(project_ids)

    runs_by_id: Dict[str, Dict[str, Any]] = {}
    history_truncated = False
    deployments: List[Dict[str, Any]] = []
    if project_ids:
        cursor = (
            db.kernel_runs.find(
                {"project_id": {"$in": project_ids}, "created_at": {"$gte": iso(now - LOOKBACK)}},
                RUN_PROJECTION,
            )
            .sort("created_at", -1)
            .limit(MAX_RUNS)
        )
        run_docs = await cursor.to_list(length=MAX_RUNS)
        history_truncated = len(run_docs) >= MAX_RUNS
        for doc in run_docs:
            if doc.get("project_id") in allowed:
                runs_by_id[doc["id"]] = doc

        dep_cursor = (
            db.deployments.find(
                {"project_id": {"$in": project_ids}, "created_at": {"$gte": _naive(now - LOOKBACK)}},
                {"_id": 0, "id": 1, "project_id": 1, "status": 1, "url": 1, "provider": 1,
                 "target_type": 1, "created_at": 1, "updated_at": 1, "deployed_at": 1},
            )
            .sort("created_at", -1)
            .limit(MAX_DEPLOYMENTS)
        )
        deployments = [
            d for d in await dep_cursor.to_list(length=MAX_DEPLOYMENTS) if d.get("project_id") in allowed
        ]

    # Overlay runs executing in this process: the persisted copy of an in-flight
    # run is the pre-execution snapshot (status "planned", no task timestamps).
    live_ids: Set[str] = set()
    if kernel is not None and project_ids:
        for live in kernel.list_active_runs():
            if live.project_id in allowed:
                runs_by_id[live.id] = live.to_dict()
                live_ids.add(live.id)

    runs = [(run, _is_current_active(run, live_ids)) for run in runs_by_id.values()]

    # Active runs: now vs same time yesterday.
    yesterday = now - DAY
    active_now = sum(1 for _, cur in runs if cur)
    if history_truncated:
        active_stat = _comparison(active_now, None, "same_time_yesterday", REASON_HISTORY_TRUNCATED)
    else:
        active_prev = sum(1 for run, cur in runs if _run_active_at(run, yesterday, cur))
        active_stat = _comparison(active_now, active_prev, "same_time_yesterday")

    # Agents working: now vs 1h ago (from per-task start/finish timestamps).
    agents_now = _working_agents_at(runs, now)
    if history_truncated:
        agents_stat = _comparison(agents_now, None, "1h_ago", REASON_HISTORY_TRUNCATED)
    else:
        agents_prev = _working_agents_at(runs, now - AGENTS_COMPARE_OFFSET)
        agents_stat = _comparison(agents_now, agents_prev, "1h_ago")

    # Pending approvals: only a gate on a run that is still active can be decided.
    pending_now = sum(
        1
        for run, cur in runs
        if cur
        for gate in run.get("approval_gates") or []
        if gate.get("status") == "pending"
    )
    approvals_stat = _comparison(pending_now, None, None, REASON_NOT_COMPARED)

    # Skills invoked: trailing 24h vs the 24h before that.
    skill_now = 0
    skill_prev = 0
    for run, _ in runs:
        for ts in _skill_timestamps(run):
            if yesterday < ts <= now:
                skill_now += 1
            elif now - 2 * DAY < ts <= yesterday:
                skill_prev += 1
    if history_truncated:
        skills_stat = _comparison(skill_now, None, "prior_24h", REASON_HISTORY_TRUNCATED)
    else:
        skills_stat = _comparison(skill_now, skill_prev, "prior_24h")

    # Spend: today (UTC) so far vs yesterday over the same elapsed time.
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if project_ids:
        spend_today = await _sum_cost(db, project_ids, day_start, now)
        spend_prev = await _sum_cost(db, project_ids, day_start - DAY, now - DAY)
    else:
        spend_today = spend_prev = 0.0
    if spend_prev > 0:
        spend_delta_pct: Optional[float] = round((spend_today - spend_prev) / spend_prev * 100, 1)
        spend_reason = None
    else:
        spend_delta_pct = None
        spend_reason = REASON_NO_BASELINE
    daily_budget = await _project_daily_budget(budget_manager, project_ids)
    run_caps = round(
        sum(
            float(((run.get("config") or {}).get("max_budget_usd")) or 0.0)
            for run, cur in runs
            if cur
        ),
        6,
    )
    spend_stat = {
        "current_usd": spend_today,
        "previous_usd": spend_prev,
        "delta_pct": spend_delta_pct,
        "compared_to": "yesterday_same_time",
        "unavailable_reason": spend_reason,
        "daily_budget_usd": daily_budget,
        "active_run_caps_usd": run_caps,
    }

    # Activity feed.
    events: List[Dict[str, Any]] = []
    for run, _ in runs:
        events.extend(_run_events(run, names.get(run.get("project_id"), run.get("project_id"))))
    for dep in deployments:
        events.extend(_deployment_events(dep, names.get(dep.get("project_id"), dep.get("project_id"))))
    events = [e for e in events if e["at"] <= now]
    events.sort(key=lambda e: (e["at"], e["id"]), reverse=True)
    activity = [{**e, "at": iso(e["at"])} for e in events[:ACTIVITY_LIMIT]]

    return {
        "window": window,
        "generated_at": iso(now),
        "scope": {
            "project_count": len(project_ids),
            "projects_truncated": projects_truncated,
            "max_projects": MAX_PROJECTS,
            "history_truncated": history_truncated,
        },
        "stats": {
            "active_runs": active_stat,
            "agents_working": agents_stat,
            "pending_approvals": approvals_stat,
            "spend_today": spend_stat,
            "skills_invoked": skills_stat,
        },
        "activity": activity,
    }
