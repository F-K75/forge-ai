"""Motor (async MongoDB) persistence for runs and backlog items."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import get_settings
from .models import (
    BacklogItem,
    ConsolidatedReport,
    Effort,
    Issue,
    ReviewRun,
    SEVERITY_RANK,
    Severity,
)

RUNS_COLLECTION = "review_runs"
BACKLOG_COLLECTION = "backlog_items"

_client: Optional[AsyncIOMotorClient] = None


async def get_db() -> AsyncIOMotorDatabase:
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncIOMotorClient(
            settings.mongodb_url,
            maxPoolSize=20,
            serverSelectionTimeoutMS=5000,
        )
        await _ensure_indexes(_client[settings.mongodb_db])
    return _client[get_settings().mongodb_db]


async def _ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    try:
        await db[RUNS_COLLECTION].create_index("run_id", unique=True)
        await db[RUNS_COLLECTION].create_index([("created_at", -1)])
        await db[BACKLOG_COLLECTION].create_index("id", unique=True)
        await db[BACKLOG_COLLECTION].create_index([("run_id", 1), ("severity_rank", -1)])
    except Exception:
        pass


async def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def _run_doc(run: ReviewRun) -> dict:
    return run.model_dump(mode="json")


async def save_run(run: ReviewRun) -> None:
    db = await get_db()
    await db[RUNS_COLLECTION].replace_one(
        {"run_id": run.run_id}, _run_doc(run), upsert=True
    )


async def update_run(run: ReviewRun) -> None:
    run.updated_at = datetime.now(timezone.utc)
    await save_run(run)


async def get_run(run_id: str) -> Optional[ReviewRun]:
    db = await get_db()
    doc = await db[RUNS_COLLECTION].find_one({"run_id": run_id}, {"_id": 0})
    return ReviewRun.model_validate(doc) if doc else None


async def list_runs(limit: int = 50) -> list[ReviewRun]:
    db = await get_db()
    cursor = db[RUNS_COLLECTION].find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [ReviewRun.model_validate(doc) for doc in docs]


# --------------------------------------------------------------------------- #
# Backlog
# --------------------------------------------------------------------------- #
_EFFORT_BY_SEVERITY = {
    Severity.critical: Effort.L,
    Severity.high: Effort.M,
    Severity.medium: Effort.M,
    Severity.low: Effort.S,
}


def _impact_for(severity: Severity) -> int:
    return {Severity.critical: 10, Severity.high: 8, Severity.medium: 5, Severity.low: 2}[
        severity
    ]


def build_backlog_items(run_id: str, consolidated: ConsolidatedReport) -> list[BacklogItem]:
    """Derive backlog items from the consolidated issue list.

    Effort/impact are heuristic defaults keyed off severity; the CTO model
    can refine them later. ``source_agent`` is best-effort from the issue's
    description provenance (consolidation merges sources, so we tag 'cto').
    """
    items: list[BacklogItem] = []
    seen: set[tuple[str, str]] = set()
    for issue in consolidated.deduplicated_issues or consolidated.top_25_improvements:
        key = (issue.severity.value, issue.title.strip().lower())
        if key in seen:
            continue
        seen.add(key)
        items.append(
            BacklogItem(
                run_id=run_id,
                title=issue.title,
                description=issue.description,
                fix=issue.fix,
                severity=issue.severity,
                effort=_EFFORT_BY_SEVERITY[issue.severity],
                impact=_impact_for(issue.severity),
                source_agent="cto",
                files=issue.files,
            )
        )
    return items


async def save_backlog_items(items: list[BacklogItem]) -> None:
    if not items:
        return
    db = await get_db()
    docs = []
    for item in items:
        doc = item.model_dump(mode="json")
        doc["severity_rank"] = SEVERITY_RANK.get(item.severity.value, 0)
        docs.append(doc)
    await db[BACKLOG_COLLECTION].insert_many(docs)


async def get_backlog(run_id: str, sort_by: str = "severity") -> list[dict]:
    db = await get_db()
    if sort_by == "impact":
        sort = [("impact", -1), ("severity_rank", -1)]
    else:
        sort = [("severity_rank", -1), ("impact", -1)]
    cursor = db[BACKLOG_COLLECTION].find({"run_id": run_id}, {"_id": 0}).sort(sort)
    return await cursor.to_list(length=1000)
