"""MongoDB transactions for multi-document money moves
(docs/architecture/agent-collaboration-plan.md §10, decision U10).

``run_financial_txn`` is the only way the ledger moves money across
documents (T1 admission, T2 settlement, T3 release). Rules (§10.4):

1. ``session.with_transaction(callback)``: the driver retries the callback on
   ``TransientTransactionError`` and the commit on
   ``UnknownTransactionCommitResult``, so **callbacks are idempotent**: each
   one inserts its ``credit_transactions(build_id, kind)`` row first, and the
   unique index turns a second application into ``DuplicateKeyError``.
2. Read concern ``snapshot``, write concern ``majority``, read preference
   ``primary``.
3. No provider, broker or other network I/O inside a callback.
4. Short: a commit is bounded by ``max_commit_time_ms``.
5. Collections and indexes are created at startup (``_ensure_indexes``),
   never implicitly inside a transaction.
6. A duplicate key on an idempotency index means "already applied":
   ``AlreadyApplied`` is raised and the caller re-reads the state.
7. If the driver gives up with ``UnknownTransactionCommitResult`` (the
   connection dropped at commit and the outcome is unknown), the whole
   callback is run again: either the first commit did not happen and this
   one applies it, or it did and the idempotency row makes this one
   ``AlreadyApplied``. Money moves exactly once either way (TX-4).

``ensure_ledger_topology`` is the startup guard (TX-5): transactions need a
replica set, so the ledger refuses to run on a standalone server and
admission answers with a service error instead of moving any money.

Unit tests drive the callbacks with an in-memory double; atomicity,
isolation and fault behaviour are proven only on a real replica set
(tests marked rs0, CI job ``mongo-integration``).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional, TypeVar

from pymongo import ReadPreference
from pymongo.errors import DuplicateKeyError, PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

logger = logging.getLogger(__name__)

T = TypeVar("T")

TRANSIENT_LABEL = "TransientTransactionError"
UNKNOWN_COMMIT_LABEL = "UnknownTransactionCommitResult"
MAX_COMMIT_TIME_MS = 5_000


class AlreadyApplied(Exception):
    """An idempotency key of this money move already exists: it was applied
    before (or a concurrent settler won). Nothing moved this time."""

    def __init__(self, label: str, detail: Optional[str] = None):
        self.label = label
        super().__init__(f"{label}: already applied" + (f" ({detail})" if detail else ""))


class LedgerUnavailable(RuntimeError):
    """``ledger_v2`` cannot run: the server is not a replica-set member, so
    there are no transactions (fail closed, TX-5, §12 row 17)."""

    code = "ledger_unavailable"


@dataclass(frozen=True)
class Topology:
    set_name: Optional[str]
    writable_primary: bool

    @property
    def replica_set(self) -> bool:
        return bool(self.set_name)


_topology: Optional[Topology] = None


def reset_topology_cache() -> None:
    global _topology
    _topology = None


async def probe_topology(db) -> Topology:
    hello = await db.command("hello")
    return Topology(
        set_name=hello.get("setName"),
        writable_primary=bool(hello.get("isWritablePrimary", hello.get("ismaster", False))),
    )


async def ensure_ledger_topology(db, *, refresh: bool = False) -> Topology:
    """Raise ``LedgerUnavailable`` unless the server is a replica-set
    member. A passing result is cached for the process; a failing one is
    re-probed on the next call (so a standalone that is converted to a
    replica set does not need a restart, and a probe error never counts as
    passing)."""
    global _topology
    if _topology is not None and _topology.replica_set and not refresh:
        return _topology
    try:
        topology = await probe_topology(db)
    except Exception as exc:
        logger.error("ledger_v2 topology probe failed; refusing ledger operations", exc_info=True)
        raise LedgerUnavailable(f"cannot determine the MongoDB topology: {exc}") from exc
    if not topology.replica_set:
        logger.critical(
            "ledger_v2 is on but MongoDB is not a replica-set member (no hello.setName): "
            "transactions are unavailable, so the ledger refuses to run and admission is rejected"
        )
        _topology = None
        raise LedgerUnavailable("MongoDB is not a replica-set member; transactions are unavailable")
    _topology = topology
    return topology


def transaction_options() -> dict:
    return {
        "read_concern": ReadConcern("snapshot"),
        "write_concern": WriteConcern("majority"),
        "read_preference": ReadPreference.PRIMARY,
        "max_commit_time_ms": MAX_COMMIT_TIME_MS,
    }


async def run_financial_txn(
    db,
    fn: Callable[[Any], Awaitable[T]],
    *,
    label: str,
    unknown_commit_retries: int = 2,
) -> T:
    """Run ``fn(session)`` in one transaction and return its result.

    ``fn`` must be idempotent and do no network I/O besides the session's
    own reads and writes. Raises ``AlreadyApplied`` when an idempotency key
    already exists (nothing moved this time), or whatever ``fn`` raised
    (the transaction was aborted, nothing moved)."""
    attempts = 0
    while True:
        try:
            async with await db.client.start_session() as session:
                return await session.with_transaction(fn, **transaction_options())
        except DuplicateKeyError as exc:
            raise AlreadyApplied(label, str(exc)[:200]) from exc
        except PyMongoError as exc:
            if exc.has_error_label(UNKNOWN_COMMIT_LABEL) and attempts < unknown_commit_retries:
                attempts += 1
                logger.warning(
                    "%s: commit outcome unknown; re-running the idempotent transaction (attempt %d)",
                    label, attempts + 1,
                )
                continue
            raise
