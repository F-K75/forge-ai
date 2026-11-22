"""Operation context for usage attribution (docs/architecture/agent-
collaboration-plan.md §7.1, §15.2).

An *operation* is one ledger stage (`stage_key`) of a build; a *dispatch* is
one attempt at running it (dispatch 2 is the C9 recovery); every provider
call made while it runs (primary, retry, fallback, repair, guardrail,
classifier, cache hit) is one *attempt* and one `ai_usage` row.

A1 creates operations (W1/W2) and will enter ``operation_scope`` around each
dispatch; until then rows carry ``operation_id = None`` and are tied together
by the gateway ``request_id`` instead. Nothing here decides money.
"""

from __future__ import annotations

import contextvars
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, Optional


@dataclass
class OperationContext:
    operation_id: Optional[str]
    dispatch_no: Optional[int] = None
    stage_key: Optional[str] = None
    _attempt_seq: int = 0
    # Once-per-operation memo of the input classifier verdict, keyed by a
    # digest of the screened user content (F29-b: once per operation, not
    # per provider attempt, retry or repair).
    input_screen_verdicts: Dict[str, Any] = field(default_factory=dict)

    def next_attempt_seq(self) -> int:
        self._attempt_seq += 1
        return self._attempt_seq


_operation: contextvars.ContextVar[Optional[OperationContext]] = contextvars.ContextVar(
    "forge_operation", default=None
)


@contextmanager
def operation_scope(
    operation_id: str,
    *,
    dispatch_no: Optional[int] = None,
    stage_key: Optional[str] = None,
) -> Iterator[OperationContext]:
    ctx = OperationContext(operation_id=operation_id, dispatch_no=dispatch_no, stage_key=stage_key)
    token = _operation.set(ctx)
    try:
        yield ctx
    finally:
        _operation.reset(token)


def current_operation() -> Optional[OperationContext]:
    return _operation.get()
