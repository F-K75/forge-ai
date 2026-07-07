"""Lightweight, idempotent, versioned database migration runner (DB-002).

Forge previously relied on implicit index provisioning in
``core.database._ensure_indexes`` at startup, with no record of which schema
changes had been applied and no orderly way to run versioned data backfills.
This module adds a small migration framework:

- Migrations are registered with ``@migration(version, name, description)``.
- ``run_migrations(db)`` runs, in ascending version order, only migrations
  whose version is not yet recorded as ``applied`` in the ``__forge_migrations``
  collection. Each applied migration is recorded with its version, name,
  status, and timestamp for auditability.
- Execution is best-effort and non-fatal: a single failing migration is logged,
  recorded as ``failed``, and skipped so it never takes the app down at startup.

New schema/data changes should be added as new ``@migration`` entries rather
than ad-hoc startup code, so their application is tracked and repeatable across
environments.
"""
from typing import Awaitable, Callable, List, Tuple
import logging
from datetime import datetime

from core.models import PlanTier

logger = logging.getLogger(__name__)

# (version, name, description, coroutine(db) -> None)
_MIGRATIONS: List[Tuple[int, str, str, Callable[[object], Awaitable[None]]]] = []


def migration(version: int, name: str, description: str = ""):
    """Register a migration. Migrations run in ascending ``version`` order."""

    def decorator(fn: Callable[[object], Awaitable[None]]):
        _MIGRATIONS.append((version, name, description, fn))
        _MIGRATIONS.sort(key=lambda m: m[0])
        return fn

    return decorator


async def _is_applied(db, version: int) -> bool:
    try:
        doc = await db["__forge_migrations"].find_one({"version": version})
    except Exception:
        # Cannot determine state (e.g. a test fake) — skip to stay safe.
        return True
    return bool(doc) and doc.get("status") == "applied"


async def _record(db, version: int, name: str, status: str, description: str) -> None:
    try:
        await db["__forge_migrations"].update_one(
            {"version": version},
            {
                "$set": {
                    "version": version,
                    "name": name,
                    "status": status,
                    "description": description,
                    "finished_at": datetime.utcnow(),
                }
            },
            upsert=True,
        )
    except Exception:
        logger.warning("Could not record migration %s (v%s) as %s", name, version, status)


async def run_migrations(db) -> List[dict]:
    """Run all not-yet-applied migrations. Never raises."""
    try:
        results: List[dict] = []
        for version, name, description, fn in _MIGRATIONS:
            if await _is_applied(db, version):
                continue
            try:
                await fn(db)
            except Exception:
                logger.exception("Migration %s (v%s) failed", name, version)
                await _record(db, version, name, "failed", description)
                results.append({"version": version, "name": name, "status": "failed"})
                continue
            await _record(db, version, name, "applied", description)
            logger.info("Migration %s (v%s) applied", name, version)
            results.append({"version": version, "name": name, "status": "applied"})
        return results
    except Exception:
        logger.exception("run_migrations encountered an unexpected error")
        return []


@migration(1, "backfill_user_plan", "Ensure every user has a plan tier (default free).")
async def _migration_backfill_user_plan(db) -> None:
    # Users created before the plan field existed may have a missing/null plan,
    # which can break entitlement checks. Idempotent backfill to the free tier.
    await db.users.update_many(
        {
            "$or": [
                {"plan": {"$in": [None, ""]}},
                {"plan": {"$exists": False}},
            ]
        },
        {"$set": {"plan": PlanTier.FREE.value}},
    )


@migration(2, "backfill_user_banned", "Ensure every user has an explicit banned flag.")
async def _migration_backfill_user_banned(db) -> None:
    # Default missing banned flags to False so admin gating behaves predictably.
    await db.users.update_many(
        {"banned": {"$exists": False}},
        {"$set": {"banned": False}},
    )
