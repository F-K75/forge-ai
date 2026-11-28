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

from core.models import PlanTier, utcnow
from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# (version, name, description, coroutine(db) -> None)
_MIGRATIONS: List[Tuple[int, str, str, Callable[[object], Awaitable[None]]]] = []
# (version, name, description, coroutine(db) -> None) — reverse migrations
_DOWNGRADES: List[Tuple[int, str, str, Callable[[object], Awaitable[None]]]] = []


def migration(version: int, name: str, description: str = ""):
    """Register a migration. Migrations run in ascending ``version`` order."""

    def decorator(fn: Callable[[object], Awaitable[None]]):
        _MIGRATIONS.append((version, name, description, fn))
        _MIGRATIONS.sort(key=lambda m: m[0])
        return fn

    return decorator


def downgrade(version: int, name: str, description: str = ""):
    """Register a downgrade (rollback) for a migration.

    Downgrades run in descending version order so that higher-version
    rollbacks execute first, preserving referential integrity."""

    def decorator(fn: Callable[[object], Awaitable[None]]):
        _DOWNGRADES.append((version, name, description, fn))
        _DOWNGRADES.sort(key=lambda m: m[0], reverse=True)
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
                    "finished_at": utcnow(),
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


@migration(3, "backfill_is_admin", "Persist admin flag from ADMIN_EMAILS env var (AUTH-001).")
async def _migration_backfill_is_admin(db) -> None:
    # AUTH-001: admin authorization used to be an in-memory email-string-match
    # against the ADMIN_EMAILS env var. This migration backfills the persisted
    # ``is_admin`` DB field for any currently-admin user so the new role-based
    # check behaves identically after deploy. Idempotent: re-running is a no-op
    # for users already flagged.
    admin_emails_raw = settings.admin_emails or ""
    admin_emails = [e.strip() for e in admin_emails_raw.split(",") if e.strip()]
    if not admin_emails:
        return

    result = await db.users.update_many(
        {"email": {"$in": admin_emails}},
        {"$set": {"is_admin": True}},
    )
    if result.matched_count:
        logger.info(
            "Migration v3 (backfill_is_admin) set is_admin=True for %d user(s)",
            result.matched_count,
        )


@migration(4, "reapply_is_admin_from_env", "Re-apply is_admin for ADMIN_EMAILS allowlisted users.")
async def _migration_reapply_is_admin_from_env(db) -> None:
    admin_emails_raw = settings.admin_emails or ""
    admin_emails = [e.strip() for e in admin_emails_raw.split(",") if e.strip()]
    if not admin_emails:
        return

    result = await db.users.update_many(
        {"email": {"$in": admin_emails}},
        {"$set": {"is_admin": True}},
    )
    if result.matched_count:
        logger.info(
            "Migration v4 (reapply_is_admin_from_env) set is_admin=True for %d user(s)",
            result.matched_count,
        )


@migration(5, "backfill_completed_onboarding", "Ensure every user has an explicit completed_onboarding flag.")
async def _migration_backfill_completed_onboarding(db) -> None:
    result = await db.users.update_many(
        {"completed_onboarding": {"$exists": False}},
        {"$set": {"completed_onboarding": False}},
    )
    if result.matched_count:
        logger.info(
            "Migration v5 (backfill_completed_onboarding) set completed_onboarding=False for %d user(s)",
            result.matched_count,
        )


@migration(6, "os_indexes", "Forge OS (WS-C): indexes for the os_* collections (docs/os/ARCHITECTURE.md).")
async def _migration_os_indexes(db) -> None:
    from core.os.indexes import ensure_os_indexes

    await ensure_os_indexes(db)


async def run_downgrades(db, target_version: int = 0) -> List[dict]:
    """Roll back applied migrations down to *target_version* (exclusive).

    Migrations are rolled back in descending version order so that
    higher-version rollbacks execute first, preserving referential
    integrity. Each downgrade is recorded with status ``rolled_back``.

    Returns a list of result dicts with ``version``, ``name``, and
    ``status`` keys.
    """
    try:
        results: List[dict] = []
        for version, name, description, fn in _DOWNGRADES:
            if version <= target_version:
                continue
            if not await _is_applied(db, version):
                continue
            try:
                await fn(db)
            except Exception:
                logger.exception("Downgrade %s (v%s) failed", name, version)
                await _record(db, version, name, "rollback_failed", description)
                results.append({"version": version, "name": name, "status": "rollback_failed"})
                continue
            await _record(db, version, name, "rolled_back", description)
            logger.info("Migration v%s (%s) rolled back", version, name)
            results.append({"version": version, "name": name, "status": "rolled_back"})
        return results
    except Exception:
        logger.exception("run_downgrades encountered an unexpected error")
        return []


@downgrade(3, "backfill_is_admin", "Remove the is_admin flag backfilled from ADMIN_EMAILS.")
async def _downgrade_backfill_is_admin(db) -> None:
    admin_emails_raw = settings.admin_emails or ""
    admin_emails = [e.strip() for e in admin_emails_raw.split(",") if e.strip()]
    if not admin_emails:
        return
    await db.users.update_many(
        {"email": {"$in": admin_emails}},
        {"$unset": {"is_admin": True}},
    )


@downgrade(2, "backfill_user_banned", "Remove the banned flag backfill.")
async def _downgrade_backfill_user_banned(db) -> None:
    await db.users.update_many(
        {"banned": {"$exists": True}},
        {"$unset": {"banned": True}},
    )


@downgrade(1, "backfill_user_plan", "Remove the plan tier backfill.")
async def _downgrade_backfill_user_plan(db) -> None:
    await db.users.update_many(
        {"plan": PlanTier.FREE.value},
        {"$unset": {"plan": True}},
    )
