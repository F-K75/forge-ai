"""Canonical build execution state (docs/architecture/agent-collaboration-plan.md
§8.2, §15.1; decision C10; test LC-1).

``builds.build_status`` is the persisted execution state the UI derives its
status from (B1-7), never transient Celery state or WebSocket event order:

    PENDING -> RUNNING -> COMPLETED | FAILED

``builds.execution_transitions`` is the append-only history of it, one
``{from, to, at, reason, attempt_token}`` record per change. Both are written
in the same update as the legacy ``status``, which is kept in sync for one
release (``debugging`` is a sub-state of ``running``; ``success`` is
``completed``).

Rules (LC-1):

- every change of the canonical state is persisted with a transition, in
  the same write as the legacy status;
- on the ledger path, ``running`` is only ever entered with a lease (the
  transition carries the attempt's fencing token);
- ``failed`` is persisted (and ``build_failed`` emitted) only once no retry
  follows (F22).

Builds admitted before this existed have no ``build_status``; it is derived
from the legacy ``status`` when the document is loaded.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from core.models import BuildStatus, utcnow


class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


TERMINAL = frozenset({ExecutionStatus.COMPLETED.value, ExecutionStatus.FAILED.value})

_FROM_LEGACY = {
    BuildStatus.PENDING.value: ExecutionStatus.PENDING.value,
    BuildStatus.RUNNING.value: ExecutionStatus.RUNNING.value,
    BuildStatus.DEBUGGING.value: ExecutionStatus.RUNNING.value,
    BuildStatus.SUCCESS.value: ExecutionStatus.COMPLETED.value,
    BuildStatus.FAILED.value: ExecutionStatus.FAILED.value,
}


def _legacy_value(status: Any) -> str:
    return getattr(status, "value", status) or BuildStatus.PENDING.value


def canonical_for(legacy_status: Any) -> str:
    """The canonical state a legacy ``status`` maps onto."""
    return _FROM_LEGACY.get(_legacy_value(legacy_status), ExecutionStatus.PENDING.value)


def is_terminal(canonical: Optional[str]) -> bool:
    return canonical in TERMINAL


def transition_record(
    from_state: Optional[str],
    to_state: str,
    *,
    reason: Optional[str] = None,
    attempt_token: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "from": from_state,
        "to": to_state,
        "at": utcnow(),
        "reason": reason,
        "attempt_token": attempt_token,
    }


def sync(build: Any, *, reason: Optional[str] = None, attempt_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Bring ``build.build_status`` in line with ``build.status`` (already
    changed in memory) and append the transition. Idempotent: returns the
    new record, or None when the canonical state did not change."""
    target = canonical_for(build.status)
    current = getattr(build, "build_status", None)
    transitions: List[Dict[str, Any]] = build.execution_transitions
    if current == target and transitions:
        return None
    if current == target and not transitions and target == ExecutionStatus.PENDING.value:
        # A legacy document with no history: record where it starts.
        record = transition_record(None, target, reason=reason or "admitted", attempt_token=attempt_token)
    elif current == target:
        return None
    else:
        record = transition_record(current, target, reason=reason, attempt_token=attempt_token)
    transitions.append(record)
    build.build_status = target
    return record


def set_status(
    build: Any,
    legacy_status: Any,
    *,
    reason: Optional[str] = None,
    attempt_token: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Set the legacy status and the canonical state together."""
    build.status = BuildStatus(_legacy_value(legacy_status))
    return sync(build, reason=reason, attempt_token=attempt_token)


def admit(build: Any, *, reason: str = "admitted") -> None:
    """Initial transition of a newly inserted build."""
    build.build_status = canonical_for(build.status)
    if not build.execution_transitions:
        build.execution_transitions.append(
            transition_record(None, build.build_status, reason=reason)
        )


def state_fields(build: Any) -> Dict[str, Any]:
    """The three fields every state-changing write carries together."""
    return {
        "status": _legacy_value(build.status),
        "build_status": build.build_status or canonical_for(build.status),
        "execution_transitions": list(build.execution_transitions),
    }


def transition_update(
    current_build_status: Optional[str],
    legacy_status: Any,
    *,
    reason: Optional[str] = None,
    attempt_token: Optional[str] = None,
    extra_set: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """An update document for a writer that does not hold the build in
    memory: ``$set`` the legacy and canonical status and ``$push`` the
    transition in the same write."""
    target = canonical_for(legacy_status)
    update: Dict[str, Any] = {"$set": {
        "status": _legacy_value(legacy_status),
        "build_status": target,
        **(extra_set or {}),
    }}
    if current_build_status != target:
        update["$push"] = {"execution_transitions": transition_record(
            current_build_status, target, reason=reason, attempt_token=attempt_token,
        )}
    return update
