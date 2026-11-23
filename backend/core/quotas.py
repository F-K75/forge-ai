"""Build quotas (docs/architecture/agent-collaboration-plan.md §13.3; C2, U4,
U5; QT-1…QT-5).

| Control | Where |
|---|---|
| Interactive daily token budget | ``check_budget``, on **every** call, builds included, until ``build_token_exemption`` is on (U4). The free-plan 10,000-token safeguard stays |
| ``build_token_exemption`` (off) | ``enforce_call_budget``: skips the daily budget only for a call bound to a live ledger operation (QT-2) |
| Per-build token meters | ``token_meters.generation`` (generation, free_grant, customer_provider) and ``token_meters.platform`` (recovery, guardrail), recorded per provider attempt with an atomic ``$inc`` (G3, QT-3); ceilings ``build_*_token_ceiling`` (unset: no limit) |
| Per-operation ceilings (U5) | ``operation_token_ceilings[base stage]``: checked before every provider call of the operation; refusal -> operation REFUSED (QT-4) |
| Plan daily build limits (U4) | ``plan_daily_build_limits``, inside T1 (core/credit_ledger.py, QT-5) |

A U5 value follows the plan's rule: (input cap + ``max_tokens``) x provider
attempts per dispatch x dispatches. Nothing here changes a call while no
ceiling is configured and the exemption is off.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

from core import pricing
from core.operation_context import current_operation

logger = logging.getLogger(__name__)

PLATFORM_ACCOUNTS = frozenset({"recovery", "guardrail"})


class QuotaRefused(Exception):
    """A per-operation or per-build token ceiling refused a call before it
    was made. Non-transient (§8.4); the operation ends REFUSED."""

    retryable = False

    def __init__(self, stage_key: Optional[str], reason: str):
        self.stage_key, self.reason = stage_key, reason
        super().__init__(f"token quota refused {stage_key or 'call'}: {reason}")


def _settings():
    from core.config import get_settings

    return get_settings()


def operation_ceiling(stage_key: Optional[str]) -> Optional[int]:
    ceilings = _settings().operation_token_ceilings or {}
    value = ceilings.get(pricing.base_stage(stage_key or ""))
    return int(value) if value is not None else None


def build_ceiling(meter: str) -> Optional[int]:
    s = _settings()
    value = s.build_platform_token_ceiling if meter == "platform" else s.build_generation_token_ceiling
    return int(value) if value is not None else None


def _meter_consumed(run, meter: str) -> int:
    return int(((run.token_meters or {}).get(meter) or {}).get("consumed") or 0)


def authorization_failure(run, stage_key: str) -> Optional[str]:
    """W1 quota check: the operation's own ceiling (or, without one, a
    single token) must fit in what the build's generation meter has left."""
    ceiling = build_ceiling("generation")
    if ceiling is None:
        return None
    need = operation_ceiling(stage_key) or 1
    if _meter_consumed(run, "generation") + need > ceiling:
        return "quota"
    return None


@dataclass
class Binding:
    """A call bound to a live ledger operation (QT-2): the build's attempt
    still holds its lease, the operation is DISPATCHED, and the caller owns
    the build."""

    run: Any
    index: int
    record: Dict[str, Any]

    def check(self, estimated_tokens: int) -> None:
        stage_key = self.record.get("stage_key")
        ceiling = operation_ceiling(stage_key)
        if ceiling is not None and int(self.record.get("tokens") or 0) + int(estimated_tokens) > ceiling:
            raise QuotaRefused(stage_key, "operation_token_ceiling")
        build_max = build_ceiling("generation")
        if build_max is not None and _meter_consumed(self.run, "generation") + int(estimated_tokens) > build_max:
            raise QuotaRefused(stage_key, "build_token_ceiling")


def live_binding(user_id: Optional[str]) -> Optional[Binding]:
    from core.build_ledger import OperationStatus, current_ledger_run

    run = current_ledger_run()
    op = current_operation()
    if run is None or op is None or not op.operation_id or run.superseded:
        return None
    if user_id is not None and run.user_id != user_id:
        return None
    for i, record in enumerate(run.ledger):
        if record.get("operation_id") == op.operation_id:
            if record.get("status") != OperationStatus.DISPATCHED.value:
                return None
            return Binding(run, i, record)
    return None


async def enforce_call_budget(
    user_id: Optional[str],
    estimated_tokens: int,
    org_id: Optional[str],
    check_budget: Callable[..., Awaitable[None]],
) -> None:
    """Replaces the router's bare ``check_budget``: the operation and build
    ceilings for a bound call, then the daily budget unless the C2
    exemption is on **and** the call is bound (QT-1, QT-2)."""
    binding = live_binding(user_id)
    if binding is not None:
        binding.check(estimated_tokens)
    if _settings().build_token_exemption and binding is not None:
        return
    await check_budget(user_id, estimated_tokens=estimated_tokens, org_id=org_id)


async def record_attempt_tokens(tokens: int, *, account: str) -> None:
    """Meter one provider attempt of the current ledger build (G3). The
    ``$inc`` is atomic and unfenced: a stale attempt's calls were still
    made. Never raises."""
    from core.build_ledger import current_ledger_run

    run = current_ledger_run()
    if run is None or tokens <= 0:
        return
    meter = "platform" if account in PLATFORM_ACCOUNTS else "generation"
    inc: Dict[str, int] = {f"token_meters.{meter}.consumed": int(tokens)}
    run.token_meters.setdefault(meter, {}).setdefault("consumed", 0)
    run.token_meters[meter]["consumed"] += int(tokens)
    op = current_operation()
    if meter == "generation" and op is not None and op.operation_id:
        for i, record in enumerate(run.ledger):
            if record.get("operation_id") == op.operation_id:
                record["tokens"] = int(record.get("tokens") or 0) + int(tokens)
                inc[f"ledger.{i}.tokens"] = int(tokens)
                break
    try:
        await run.db.builds.update_one({"id": run.build_id}, {"$inc": inc})
    except Exception:
        logger.warning("Build %s: token meter update failed", run.build_id, exc_info=True)
