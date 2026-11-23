"""The build ledger: operations, dispatches and the commit protocol
(docs/architecture/agent-collaboration-plan.md §7.1, §8.1-§8.3, §8.5-§8.7,
§10.3 G1/G2).

Build -> Operation (``stage_key``, charged at most once) -> Dispatch (<= 2;
dispatch 2 is the C9 recovery, never on BYOK) -> provider attempts (one
``ai_usage`` row each, attributed through A2's ``operation_scope``).

Every write here is a guarded single-document update of the build,
filtered on the attempt's fencing token ``T`` (``attempt_token``). A write
that matches nothing raises ``AttemptSuperseded``: another attempt (or the
sweeper) owns the build now, so this one stops without charging, retrying
or settling.

Commit protocol (§8.3):

| Step | Here |
|---|---|
| W1 | ``begin``: ceiling, quota and boundary check; ``$push`` the operation AUTHORIZED (or REFUSED) |
| W2 | ``begin``/``_dispatch``: ``$set`` DISPATCHED plus the dispatch record, before the provider call |
| W3 | A2's router/gateway: one ``ai_usage`` row per attempt, carrying ``operation_id`` and ``dispatch_no`` |
| W5 | the caller's usability predicate; unusable output is never journaled |
| W4 | ``journal``: the usable response, kept until W7 (24 h TTL backstop; X1) |
| W6 | the caller persists output (files, step output, messages) idempotently |
| W7 | ``commit``/``fail``: one ``$set`` of the operation outcome, its ``credits``, ``credits_used`` and the caller's fields (AgentStep outcome, ``active_manifest_version`` for A3), filtered on ``T`` and the operation still DISPATCHED |

Charging (C8): only a COMPLETED operation with usable, persisted output
carries credits, at most once per ``stage_key`` (I-4). A mandatory operation
is authorized while ``consumed + price <= cap``; an optional one only out
of what the remaining mandatory worst case leaves (so clarifications never
crowd out a mandatory stage). ``cap`` is the reservation (``user_credits``)
or the free-build allowance (``free_grant``); BYOK prices are 0 (C4).

Recovery on resume (§8.6): a DISPATCHED operation with a journal entry is
committed from it with no provider call (RT-1, RT-11, any credential); an
optional one without is INTERRUPTED and skipped; a mandatory one on the
Forge credential gets dispatch 2 under account ``recovery`` (C9), once; on
BYOK it is INTERRUPTED and the build terminates (U1).
"""

from __future__ import annotations

import asyncio
import contextvars
import copy
import logging
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, Iterator, List, Optional, Tuple

from core import execution_state, pricing
from core.credit_ledger import FundingSource
from core.models import BuildStatus, utcnow
from core.operation_context import operation_scope
from core.pricing import Quote

logger = logging.getLogger(__name__)


class OperationStatus(str, Enum):
    AUTHORIZED = "authorized"
    DISPATCHED = "dispatched"
    COMPLETED = "completed"
    FAILED = "failed"
    INTERRUPTED = "interrupted"
    REFUSED = "refused"


class DispatchStatus(str, Enum):
    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"
    INTERRUPTED = "interrupted"


OPEN = (OperationStatus.AUTHORIZED.value, OperationStatus.DISPATCHED.value)


class LedgerError(Exception):
    """Base of the ledger's own exceptions."""


class AttemptSuperseded(LedgerError):
    """A fenced write matched no document: this attempt lost its lease.
    Non-transient: stop, no charge, no retry, no settlement (§8.7)."""

    def __init__(self, build_id: str):
        self.build_id = build_id
        super().__init__(f"build {build_id}: attempt superseded (fencing token no longer current)")


class LedgerRefused(LedgerError):
    """W1 refused an operation (ceiling, quota or budget); no provider call
    was made. Non-transient (§8.4)."""

    def __init__(self, stage_key: str, reason: str, mandatory: bool):
        self.stage_key, self.reason, self.mandatory = stage_key, reason, mandatory
        super().__init__(f"operation {stage_key} refused: {reason}")


class UnusableOutput(ValueError):
    """The usability predicate (§8.1) rejected the output: the operation
    FAILED uncharged. Model-output retry class (§8.4)."""

    def __init__(self, stage_key: str, reason: str = "unusable_output"):
        self.stage_key, self.reason = stage_key, reason
        super().__init__(f"operation {stage_key}: {reason}")


class ByokInterrupted(LedgerError):
    """A mandatory BYOK operation was interrupted: the build terminates; no
    dispatch 2 on any credential (U1, §8.6)."""

    def __init__(self, stage_key: str):
        self.stage_key = stage_key
        super().__init__(f"operation {stage_key} was interrupted on your own provider key; not re-run")


class RecoveryExhausted(LedgerError):
    """Dispatch 2 of a mandatory operation failed or was interrupted: no
    third dispatch; the build terminates (RT-3)."""

    def __init__(self, stage_key: str):
        self.stage_key = stage_key
        super().__init__(f"operation {stage_key}: recovery dispatch did not complete")


class OperationSkipped(LedgerError):
    """An optional operation was interrupted on a previous attempt and is
    not re-run (§8.6); the caller continues without it."""

    def __init__(self, stage_key: str):
        self.stage_key = stage_key
        super().__init__(f"optional operation {stage_key} skipped after an interruption")


# --------------------------------------------------------------------------- #
# Context
# --------------------------------------------------------------------------- #

_run_var: contextvars.ContextVar[Optional["LedgerRun"]] = contextvars.ContextVar("forge_ledger_run", default=None)


def current_ledger_run() -> Optional["LedgerRun"]:
    return _run_var.get()


@contextmanager
def ledger_scope(run: "LedgerRun") -> Iterator["LedgerRun"]:
    token = _run_var.set(run)
    try:
        yield run
    finally:
        _run_var.reset(token)


@dataclass
class OpHandle:
    """One dispatch of one operation, between W2 and W7."""

    index: int
    op: Dict[str, Any]
    dispatch_no: int
    account: str
    journaled: bool = False
    journal_result: Any = None

    @property
    def operation_id(self) -> str:
        return self.op["operation_id"]

    @property
    def stage_key(self) -> str:
        return self.op["stage_key"]

    @property
    def price(self) -> int:
        return int(self.op.get("price") or 0)

    @property
    def mandatory(self) -> bool:
        return bool(self.op.get("mandatory"))

    def scope(self):
        """A2's ``operation_scope`` for this dispatch: every provider attempt
        made inside it is an ``ai_usage`` row with this operation id."""
        return operation_scope(
            self.operation_id, dispatch_no=self.dispatch_no, stage_key=self.stage_key, account=self.account,
        )


@dataclass
class AcquireResult:
    run: Optional["LedgerRun"]
    outcome: str  # acquired | settled | busy | not_reserved | missing
    doc: Optional[Dict[str, Any]] = None


def _settings():
    from core.config import get_settings

    return get_settings()


# --------------------------------------------------------------------------- #
# The run
# --------------------------------------------------------------------------- #


class LedgerRun:
    """One attempt's view of a ledger build. Single writer under the lease:
    the in-memory ledger mirrors the document because every change to it
    goes through ``write``, which is fenced on ``token``."""

    def __init__(self, db, doc: Dict[str, Any], token: str):
        self.db = db
        self.build_id: str = doc["id"]
        self.user_id: str = doc["user_id"]
        self.token = token
        funding = doc.get("funding") or {}
        self.source = FundingSource(funding.get("source") or FundingSource.USER_CREDITS.value)
        self.reserved = int(funding.get("reserved_credits") or 0)
        self.allowance = int(funding.get("allowance") if funding.get("allowance") is not None
                             else funding.get("max_cost") or 0)
        self.quote = Quote.from_doc(funding["quote"]) if funding.get("quote") else pricing.quote_from_settings()
        boundary = doc.get("processing_boundary") or {}
        self.credential = "byok" if (
            boundary.get("credential_mode") == "byok" or self.source == FundingSource.BYOK
        ) else "forge"
        self.ledger: List[Dict[str, Any]] = copy.deepcopy(doc.get("ledger") or [])
        self.token_meters: Dict[str, Dict[str, int]] = copy.deepcopy(doc.get("token_meters") or {})
        self.integrations: Optional[bool] = None
        self.superseded = False
        self.pending: Dict[str, OpHandle] = {}
        self.incomplete_stages: List[Dict[str, Any]] = []
        self.last_failure: Optional[Tuple[str, str]] = None
        self._heartbeat: Optional[asyncio.Task] = None

    # -- lease (G2) ------------------------------------------------------ #

    @classmethod
    async def acquire(cls, db, build_id: str, *, now: Optional[datetime] = None,
                      lease_seconds: Optional[int] = None) -> AcquireResult:
        """L1: take the lease if the build is RESERVED, unsettled and no live
        lease exists; enter ``running`` with this attempt's token in the
        same write. Otherwise say why not (settled, another live attempt)."""
        from pymongo import ReturnDocument

        now = now or utcnow()
        lease = timedelta(seconds=lease_seconds or _settings().ledger_lease_seconds)
        doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
        if doc is None:
            return AcquireResult(None, "missing")
        if doc.get("settlement"):
            return AcquireResult(None, "settled", doc)
        if (doc.get("funding") or {}).get("state") != "reserved":
            return AcquireResult(None, "not_reserved", doc)
        token = str(uuid.uuid4())
        previous = doc.get("build_status") or execution_state.canonical_for(doc.get("status"))
        update = execution_state.transition_update(
            previous, BuildStatus.RUNNING, reason="lease_acquired", attempt_token=token,
            extra_set={
                "attempt_token": token,
                "lease_expires_at": now + lease,
                "retry_scheduled_until": None,
            },
        )
        acquired = await db.builds.find_one_and_update(
            {
                "id": build_id,
                "settlement": None,
                "funding.state": "reserved",
                "$or": [{"lease_expires_at": None}, {"lease_expires_at": {"$lt": now}}],
            },
            update,
            return_document=ReturnDocument.AFTER,
            projection={"_id": 0},
        )
        if acquired is None:
            again = await db.builds.find_one({"id": build_id}, {"_id": 0}) or {}
            if again.get("settlement"):
                return AcquireResult(None, "settled", again)
            logger.info("Build %s: duplicate delivery suppressed (a live lease exists)", build_id)
            return AcquireResult(None, "busy", again)
        return AcquireResult(cls(db, acquired, token), "acquired", acquired)

    def fence(self) -> Dict[str, Any]:
        return {"id": self.build_id, "attempt_token": self.token}

    async def write(self, update: Dict[str, Any], *, extra_filter: Optional[Dict[str, Any]] = None) -> None:
        """A guarded single-document update of the build (G1/G2)."""
        query = self.fence()
        if extra_filter:
            query.update(extra_filter)
        result = await self.db.builds.update_one(query, update)
        if not getattr(result, "matched_count", 0):
            self.superseded = True
            raise AttemptSuperseded(self.build_id)

    async def assert_live(self) -> None:
        if self.superseded or await self.db.builds.find_one(self.fence(), {"_id": 0, "id": 1}) is None:
            self.superseded = True
            raise AttemptSuperseded(self.build_id)

    async def renew(self, *, now: Optional[datetime] = None) -> bool:
        """L2: extend the lease. False when fenced off."""
        now = now or utcnow()
        lease = timedelta(seconds=_settings().ledger_lease_seconds)
        result = await self.db.builds.update_one(self.fence(), {"$set": {"lease_expires_at": now + lease}})
        if not getattr(result, "matched_count", 0):
            self.superseded = True
            return False
        return True

    def start_heartbeat(self, interval: Optional[float] = None) -> None:
        """Renew the lease every ``ledger_heartbeat_seconds`` until stopped
        or fenced off. Runs on the worker's event loop next to the build."""
        interval = float(interval or _settings().ledger_heartbeat_seconds)

        async def beat():
            try:
                while True:
                    await asyncio.sleep(interval)
                    if not await self.renew():
                        logger.warning("Build %s: lease lost; this attempt is fenced off", self.build_id)
                        return
            except asyncio.CancelledError:
                return
            except Exception:
                logger.warning("Build %s: heartbeat failed", self.build_id, exc_info=True)

        self._heartbeat = asyncio.ensure_future(beat())

    async def stop_heartbeat(self) -> None:
        task, self._heartbeat = self._heartbeat, None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except BaseException:
                pass

    async def finalize(self, update: Dict[str, Any]) -> None:
        """The attempt's last build write before settlement: fenced on ``T``
        and swapping the token to ``final:<T>``, so no operation of this
        (or any stale) attempt can commit after it and settlement computes
        ``consumed`` from a closed ledger (§3.3 "fence")."""
        final = f"final:{self.token}"
        update = copy.deepcopy(update)
        update.setdefault("$set", {}).update({
            "attempt_token": final, "lease_expires_at": None, "finalized_at": utcnow(),
        })
        await self.write(update)
        self.token = final

    async def release_for_retry(self, until: datetime, extra_set: Optional[Dict[str, Any]] = None) -> None:
        """Before a Celery retry: give the lease up so the retry can take
        it at once; the build stays ``running`` (F22: no ``failed`` before a
        retry)."""
        await self.write({"$set": {
            "lease_expires_at": None,
            "retry_scheduled_until": until,
            **(extra_set or {}),
        }})

    # -- reading the ledger --------------------------------------------- #

    def ops_for(self, stage_key: str) -> List[Tuple[int, Dict[str, Any]]]:
        return [(i, op) for i, op in enumerate(self.ledger) if op.get("stage_key") == stage_key]

    def latest(self, stage_key: str) -> Tuple[Optional[int], Optional[Dict[str, Any]]]:
        ops = self.ops_for(stage_key)
        return ops[-1] if ops else (None, None)

    def completed(self, stage_key: str) -> Optional[Dict[str, Any]]:
        for _, op in self.ops_for(stage_key):
            if op.get("status") == OperationStatus.COMPLETED.value:
                return op
        return None

    @property
    def consumed(self) -> int:
        return sum(int(op.get("credits") or 0) for op in self.ledger
                   if op.get("status") == OperationStatus.COMPLETED.value)

    @property
    def cap(self) -> int:
        if self.source == FundingSource.USER_CREDITS:
            return self.reserved
        if self.source == FundingSource.FREE_GRANT:
            return self.allowance
        return 0

    @property
    def debug_iterations(self) -> int:
        return self.quote.params.debug_iterations

    def price_for(self, stage_key: str) -> int:
        if self.credential == "byok" or self.source == FundingSource.BYOK:
            return 0
        return self.quote.prices.price_for(stage_key)

    def settled_keys(self) -> set:
        """Stage keys that can no longer be charged."""
        keys = set()
        for op in self.ledger:
            if op.get("status") == OperationStatus.COMPLETED.value or op.get("reason") == "no_change":
                keys.add(op["stage_key"])
        return keys

    def authorization_failure(self, stage_key: str, mandatory: bool, price: Optional[int] = None) -> Optional[str]:
        """W1 decision. None when the operation may run."""
        price = self.price_for(stage_key) if price is None else price
        if price > 0:
            if mandatory:
                if self.consumed + price > self.cap:
                    return "ceiling"
            else:
                remaining = 0 if self.credential == "byok" else pricing.remaining_mandatory_worst_case(
                    self.quote.prices, self.quote.params, self.settled_keys(), integrations=self.integrations,
                )
                if self.consumed + price + remaining > self.cap:
                    return "ceiling"
        from core import quotas

        return quotas.authorization_failure(self, stage_key)

    def can_afford_optional(self, stage_key: str = "clarification") -> bool:
        return self.authorization_failure(stage_key, mandatory=False) is None

    # -- W1 / W2 -------------------------------------------------------- #

    def _account(self, dispatch_no: int) -> str:
        if self.credential == "byok":
            return "customer_provider"
        if dispatch_no >= 2:
            return "recovery"
        if self.source == FundingSource.FREE_GRANT:
            return "free_grant"
        return "generation"

    def _new_op(self, stage_key: str, agent: Optional[str], mandatory: bool, price: int,
                retry_of: Optional[str]) -> Dict[str, Any]:
        seq = len(self.ops_for(stage_key)) + 1
        return {
            "operation_id": f"{self.build_id}:{stage_key}:{seq}",
            "stage_key": stage_key,
            "seq": seq,
            "agent": agent,
            "mandatory": mandatory,
            "funding_source": self.source.value,
            "credential": self.credential,
            "price": price,
            "credits": 0,
            "status": OperationStatus.AUTHORIZED.value,
            "reason": None,
            "dispatches": [],
            "retry_of": retry_of,
            "tokens": 0,
            "authorized_at": utcnow(),
            "resolved_at": None,
        }

    async def begin(self, stage_key: str, *, agent: Optional[str] = None,
                    mandatory: Optional[bool] = None) -> Optional[OpHandle]:
        """W1 + W2 for ``stage_key``, or the recovery decision for an
        operation an earlier attempt left open. Returns the dispatch handle;
        None for an interrupted optional operation (skip it). Raises
        ``LedgerRefused``, ``ByokInterrupted`` or ``RecoveryExhausted``."""
        mandatory = pricing.is_mandatory(stage_key) if mandatory is None else bool(mandatory)
        i, prev = self.latest(stage_key)
        if prev is not None and prev.get("status") == OperationStatus.AUTHORIZED.value:
            # Crash between W1 and W2: no provider call happened.
            return await self._dispatch(i, 1)
        if prev is not None and prev.get("status") == OperationStatus.DISPATCHED.value:
            return await self._resume_dispatched(i, prev)
        if (prev is not None and prev.get("status") == OperationStatus.INTERRUPTED.value
                and prev.get("mandatory") and self.credential == "forge"
                and len(prev.get("dispatches") or []) < 2 and prev.get("reason") == "interrupted"):
            return await self._dispatch(i, 2, account="recovery")

        price = self.price_for(stage_key)
        retry_of = prev.get("operation_id") if prev is not None else None
        if self.completed(stage_key) is not None:
            # Regenerating a stage that already committed (e.g. its files
            # were lost before A3): never charged twice for one stage_key.
            price = 0
        op = self._new_op(stage_key, agent, mandatory, price, retry_of)
        refusal = self.authorization_failure(stage_key, mandatory, price)
        if refusal:
            op.update(status=OperationStatus.REFUSED.value, reason=refusal, resolved_at=utcnow())
            await self.write({"$push": {"ledger": op}})
            self.ledger.append(op)
            self.last_failure = (stage_key, refusal)
            raise LedgerRefused(stage_key, refusal, mandatory)
        await self.write({"$push": {"ledger": op}})
        self.ledger.append(op)
        return await self._dispatch(len(self.ledger) - 1, 1)

    async def _dispatch(self, i: int, dispatch_no: int, *, account: Optional[str] = None,
                        interrupt_previous: bool = False) -> OpHandle:
        op = self.ledger[i]
        account = account or self._account(dispatch_no)
        record = {
            "dispatch_no": dispatch_no,
            "account": account,
            "credential": self.credential,
            "status": DispatchStatus.STARTED.value,
            "journaled": False,
            "error_class": None,
            "started_at": utcnow(),
            "resolved_at": None,
        }
        update: Dict[str, Any] = {
            "$set": {f"ledger.{i}.status": OperationStatus.DISPATCHED.value, f"ledger.{i}.reason": None},
            "$push": {f"ledger.{i}.dispatches": record},
        }
        if interrupt_previous and op.get("dispatches"):
            j = len(op["dispatches"]) - 1
            update["$set"][f"ledger.{i}.dispatches.{j}.status"] = DispatchStatus.INTERRUPTED.value
            update["$set"][f"ledger.{i}.dispatches.{j}.resolved_at"] = utcnow()
        await self.write(update, extra_filter={f"ledger.{i}.operation_id": op["operation_id"]})
        if interrupt_previous and op.get("dispatches"):
            op["dispatches"][-1].update(status=DispatchStatus.INTERRUPTED.value, resolved_at=utcnow())
        op["status"] = OperationStatus.DISPATCHED.value
        op["reason"] = None
        op.setdefault("dispatches", []).append(record)
        return OpHandle(i, op, dispatch_no, account)

    async def _resume_dispatched(self, i: int, op: Dict[str, Any]) -> Optional[OpHandle]:
        """An earlier attempt dispatched ``op`` and never resolved it."""
        last = op["dispatches"][-1]
        dispatch_no = int(last.get("dispatch_no") or 1)
        found, content = await self.journal_lookup(op["operation_id"], dispatch_no)
        if found:
            # 5a / RT-1 / RT-11: commit the journaled response; no call.
            return OpHandle(i, op, dispatch_no, last.get("account") or self._account(dispatch_no),
                            journaled=True, journal_result=content)
        stage_key = op["stage_key"]
        if not op.get("mandatory"):
            await self._resolve(i, OperationStatus.INTERRUPTED, "interrupted", DispatchStatus.INTERRUPTED)
            return None
        if self.credential == "byok":
            await self._resolve(i, OperationStatus.INTERRUPTED, "interrupted_byok", DispatchStatus.INTERRUPTED)
            raise ByokInterrupted(stage_key)
        if dispatch_no >= 2:
            await self._resolve(i, OperationStatus.FAILED, "recovery_interrupted", DispatchStatus.INTERRUPTED)
            raise RecoveryExhausted(stage_key)
        # 5b / C9: one platform-funded recovery dispatch, same Forge credential.
        logger.info("Build %s: %s was interrupted; recovery dispatch 2 (account=recovery)", self.build_id, stage_key)
        return await self._dispatch(i, 2, account="recovery", interrupt_previous=True)

    # -- W4: journal ---------------------------------------------------- #

    async def journal(self, handle: OpHandle, content: Any) -> None:
        """Keep the usable response until W7 commits (X1). Best effort: a
        journal that cannot be written only costs a recovery dispatch."""
        if handle.journaled:
            return
        now = utcnow()
        try:
            await self.db.llm_response_journal.update_one(
                {"operation_id": handle.operation_id, "dispatch_no": handle.dispatch_no},
                {"$set": {
                    "build_id": self.build_id,
                    "stage_key": handle.stage_key,
                    "content": content,
                    "created_at": now,
                    "expires_at": now + timedelta(seconds=_settings().llm_journal_ttl_seconds),
                }},
                upsert=True,
            )
        except Exception:
            logger.warning("Build %s: journal write failed for %s", self.build_id, handle.stage_key, exc_info=True)

    async def journal_lookup(self, operation_id: str, dispatch_no: int) -> Tuple[bool, Any]:
        try:
            doc = await self.db.llm_response_journal.find_one(
                {"operation_id": operation_id, "dispatch_no": dispatch_no}, {"_id": 0},
            )
        except Exception:
            logger.warning("Build %s: journal read failed", self.build_id, exc_info=True)
            return False, None
        if doc is None or "content" not in doc:
            return False, None
        return True, doc["content"]

    async def _journal_delete(self, handle: OpHandle) -> None:
        try:
            await self.db.llm_response_journal.delete_many({"operation_id": handle.operation_id})
        except Exception:
            logger.warning("Build %s: journal delete failed (TTL will expire it)", self.build_id, exc_info=True)

    # -- W7 ------------------------------------------------------------- #

    def charge_for(self, handle: OpHandle) -> int:
        """Credits W7 will charge: the price, unless this stage_key was
        already charged (I-4)."""
        for _, other in self.ops_for(handle.stage_key):
            if other is not handle.op and other.get("status") == OperationStatus.COMPLETED.value \
                    and int(other.get("credits") or 0) > 0:
                return 0
        return handle.price

    async def commit(self, handle: OpHandle, *, extra_set: Optional[Dict[str, Any]] = None) -> int:
        """W7, COMPLETED. Returns the credits charged."""
        credits = self.charge_for(handle)
        await self._resolve(handle.index, OperationStatus.COMPLETED, None, DispatchStatus.COMPLETED,
                            credits=credits, journaled=handle.journaled, extra_set=extra_set)
        self.pending.pop(handle.stage_key, None)
        await self._journal_delete(handle)
        return credits

    async def fail(self, handle: OpHandle, reason: str, *, status: OperationStatus = OperationStatus.FAILED,
                   error_class: Optional[str] = None, extra_set: Optional[Dict[str, Any]] = None) -> None:
        """W7, FAILED (or REFUSED/INTERRUPTED): uncharged."""
        dispatch_status = DispatchStatus.INTERRUPTED if status == OperationStatus.INTERRUPTED else DispatchStatus.FAILED
        await self._resolve(handle.index, status, reason, dispatch_status, error_class=error_class,
                            extra_set=extra_set)
        self.pending.pop(handle.stage_key, None)
        self.last_failure = (handle.stage_key, reason)

    async def fail_from_exception(self, handle: OpHandle, exc: BaseException) -> None:
        from core import quotas

        if isinstance(exc, AttemptSuperseded):
            return
        if isinstance(exc, quotas.QuotaRefused):
            await self.fail(handle, "quota", status=OperationStatus.REFUSED, error_class=type(exc).__name__)
            return
        reason = "cancelled" if type(exc).__name__ in ("SoftTimeLimitExceeded", "CancelledError", "BuildCancelled") \
            else ("unusable_output" if isinstance(exc, (UnusableOutput, ValueError)) else "provider_error")
        await self.fail(handle, reason, error_class=type(exc).__name__)

    async def _resolve(self, i: int, status: OperationStatus, reason: Optional[str],
                       dispatch_status: DispatchStatus, *, credits: int = 0, journaled: bool = False,
                       error_class: Optional[str] = None, extra_set: Optional[Dict[str, Any]] = None) -> None:
        op = self.ledger[i]
        now = utcnow()
        fields: Dict[str, Any] = {
            f"ledger.{i}.status": status.value,
            f"ledger.{i}.credits": credits,
            f"ledger.{i}.reason": reason,
            f"ledger.{i}.resolved_at": now,
        }
        dispatches = op.get("dispatches") or []
        if dispatches:
            j = len(dispatches) - 1
            fields[f"ledger.{i}.dispatches.{j}.status"] = dispatch_status.value
            fields[f"ledger.{i}.dispatches.{j}.resolved_at"] = now
            fields[f"ledger.{i}.dispatches.{j}.journaled"] = journaled
            fields[f"ledger.{i}.dispatches.{j}.error_class"] = error_class
        # Only open (uncharged) operations are resolved, so consumed grows by
        # exactly this operation's credits.
        fields["credits_used"] = self.consumed + credits
        if extra_set:
            fields.update(extra_set)
        await self.write(
            {"$set": fields},
            extra_filter={f"ledger.{i}.operation_id": op["operation_id"],
                          f"ledger.{i}.status": {"$in": list(OPEN)}},
        )
        op.update(status=status.value, credits=credits, reason=reason, resolved_at=now)
        if dispatches:
            dispatches[-1].update(status=dispatch_status.value, resolved_at=now, journaled=journaled,
                                  error_class=error_class)

    async def close_open(self, stage_key: str, reason: str = "interrupted") -> None:
        """Resolve an operation an earlier attempt left open when the
        pipeline will not re-run it (e.g. a debug pass the PM loop restarts
        past)."""
        i, op = self.latest(stage_key)
        if op is not None and op.get("status") in OPEN:
            await self._resolve(i, OperationStatus.INTERRUPTED, reason, DispatchStatus.INTERRUPTED)

    async def close_all_open(self, reason: str) -> None:
        """Before the attempt's final write: nothing it leaves behind stays
        AUTHORIZED or DISPATCHED (an operation whose call never returned
        before the build ended is INTERRUPTED, uncharged)."""
        for i, op in enumerate(self.ledger):
            if op.get("status") in OPEN:
                await self._resolve(i, OperationStatus.INTERRUPTED, reason, DispatchStatus.INTERRUPTED)
        self.pending.clear()

    def record_incomplete(self, stage_key: str, reason: str) -> None:
        self.incomplete_stages.append({"stage_key": stage_key, "reason": reason})

    def quality_fields(self, existing: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """``quality.incomplete_stages`` for ceiling and quota stops (§15.1:
        A1 writes them; the quality status itself is B2's)."""
        if not self.incomplete_stages:
            return {}
        quality = dict(existing or {})
        stages = list(quality.get("incomplete_stages") or [])
        for entry in self.incomplete_stages:
            if entry not in stages:
                stages.append(entry)
        quality["incomplete_stages"] = stages
        return {"quality": quality}


# --------------------------------------------------------------------------- #
# Agent-to-agent messages through the ledger
# --------------------------------------------------------------------------- #


@dataclass
class LedgerCommsHooks:
    """How ``InProcessAgentCommunication`` charges a reply-expecting message
    on a ledger build: one optional operation per message,
    ``clarification#<message_id>``, authorized out of the headroom the
    remaining mandatory worst case leaves, committed only for a non-empty
    answer. Never exceeds the reservation."""

    run: LedgerRun
    build: Any
    handles: Dict[str, OpHandle] = field(default_factory=dict)

    @staticmethod
    def stage_key(message) -> str:
        return f"clarification#{message.message_id}"

    def can_afford(self) -> bool:
        return self.run.can_afford_optional("clarification")

    async def authorize(self, message) -> Optional[OpHandle]:
        try:
            handle = await self.run.begin(self.stage_key(message), agent=message.recipient, mandatory=False)
        except LedgerRefused:
            return None
        if handle is not None:
            self.handles[message.message_id] = handle
        return handle

    async def recover(self, message) -> Optional[str]:
        """A message an earlier attempt dispatched: its journaled answer, or
        None (the operation is closed INTERRUPTED and nothing is re-sent)."""
        i, op = self.run.latest(self.stage_key(message))
        if op is None or op.get("status") not in OPEN:
            return None
        handle = await self.run.begin(self.stage_key(message), agent=message.recipient, mandatory=False)
        if handle is None or not handle.journaled or not isinstance(handle.journal_result, str):
            if handle is not None:
                await self.run.fail(handle, "interrupted", status=OperationStatus.INTERRUPTED)
            return None
        self.handles[message.message_id] = handle
        return handle.journal_result

    def charge(self, message) -> int:
        handle = self.handles.get(message.message_id)
        return self.run.charge_for(handle) if handle is not None else 0

    async def journal(self, message, answer: str) -> None:
        handle = self.handles.get(message.message_id)
        if handle is not None:
            await self.run.journal(handle, answer)

    async def commit(self, message) -> int:
        handle = self.handles.pop(message.message_id, None)
        if handle is None:
            return 0
        credits = self.run.charge_for(handle)
        self.build.credits_used = self.run.consumed + credits
        await self.run.commit(handle, extra_set={
            "agent_messages": [m.model_dump() for m in self.build.agent_messages],
        })
        self.build.credits_used = self.run.consumed
        return credits

    async def fail(self, message, reason: str) -> None:
        handle = self.handles.pop(message.message_id, None)
        if handle is not None:
            await self.run.fail(handle, reason)

    def scope(self, message):
        handle = self.handles.get(message.message_id)
        if handle is None:
            from contextlib import nullcontext

            return nullcontext()
        return handle.scope()
