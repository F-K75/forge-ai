from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis
from pydantic import BaseModel
from core.config import get_settings, RETENTION_TTL_SECONDS
from typing import Optional, Union
import asyncio
import json
import logging

settings = get_settings()
logger = logging.getLogger(__name__)

_mongo_client: AsyncIOMotorClient = None
_redis_client: Redis = None
_db_lock = asyncio.Lock()
_redis_lock = asyncio.Lock()


async def get_db():
    global _mongo_client
    if _mongo_client is None:
        async with _db_lock:
            if _mongo_client is None:
                _mongo_client = AsyncIOMotorClient(
                    settings.mongodb_url,
                    maxPoolSize=50,
                    minPoolSize=10,
                    # INF-008: bounded pool + fast-fail. A request that cannot get
                    # a pooled connection fails fast via waitQueueTimeoutMS rather
                    # than blocking indefinitely, and idle connections are
                    # recycled by maxIdleTimeMS.
                    maxIdleTimeMS=60_000,
                    waitQueueTimeoutMS=10_000,
                    serverSelectionTimeoutMS=5000,
                    connectTimeoutMS=10000,
                )
                try:
                    await _ensure_indexes(_mongo_client.forge)
                except Exception:
                    logger.exception("MongoDB index provisioning failed")
                    raise
    return _mongo_client.forge


async def apply_retention_ttl_indexes(db) -> None:
    """Apply the centralized data-retention policy (DB-003) as MongoDB TTL
    indexes on ``created_at`` for every collection listed in
    ``RETENTION_TTL_SECONDS``. Idempotent: re-running is a no-op for indexes
    that already exist. Failures are logged, not raised, so a single bad
    collection never blocks index provisioning for the rest.
    """
    for collection, ttl in RETENTION_TTL_SECONDS.items():
        coll = getattr(db, collection, None)
        if coll is None:
            continue
        try:
            await coll.create_index("created_at", expireAfterSeconds=ttl, name=f"retention_ttl_{collection}")
        except Exception:  # pragma: no cover - defensive
            logger.warning("Failed to create retention TTL index on %s", collection)


async def _ensure_indexes(db):
    try:
        # Centralized data-retention TTL indexes (DB-003) — applied from the
        # single RETENTION_TTL_SECONDS policy so retention is configured in one
        # place rather than scattered across per-collection index calls.
        await apply_retention_ttl_indexes(db)

        # User indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index([("id", 1)])

        # Organization indexes
        await db.organizations.create_index("slug", unique=True)

        # Project indexes
        await db.projects.create_index([("user_id", 1), ("updated_at", -1)])
        await db.projects.create_index([("id", 1)])

        # Build indexes
        await db.builds.create_index([("project_id", 1), ("user_id", 1), ("created_at", -1)])
        await db.builds.create_index([("id", 1)])
        await db.builds.create_index([("user_id", 1), ("created_at", -1)])
        # Idempotency key index (BUS-007): unique per user so a retry with the
        # same key never creates a duplicate build. Partial index so null keys
        # (builds created without an idempotency_key) don't collide.
        await db.builds.create_index(
            [("user_id", 1), ("idempotency_key", 1)],
            unique=True,
            partialFilterExpression={"idempotency_key": {"$exists": True}},
        )

        # Build files indexes
        await db.build_files.create_index([("build_id", 1), ("path", 1)], unique=True)
        await db.build_files.create_index([("build_id", 1)])
        await db.build_files.create_index("created_at")  # TTL applied by apply_retention_ttl_indexes

        # Team member indexes
        await db.team_members.create_index([("org_id", 1), ("user_id", 1)], unique=True)

        # Subscription indexes
        await db.subscriptions.create_index(
            "stripe_subscription_id", unique=True
        )
        await db.subscriptions.create_index([("user_id", 1)])

        # Invitation indexes
        await db.invitations.create_index(
            "hashed_token", unique=True
        )
        await db.invitations.create_index([("org_id", 1)])

        # Credit purchase indexes
        await db.credit_purchases.create_index(
            "stripe_payment_intent_id", unique=True
        )

        # Marketplace indexes
        await db.marketplace_items.create_index([("type", 1), ("is_public", 1), ("downloads", -1)])
        await db.marketplace_items.create_index([("title", "text"), ("description", "text")])

        # Analytics indexes
        await db.analytics_events.create_index(
            [("user_id", 1), ("event_name", 1), ("created_at", -1)]
        )
        await db.analytics_events.create_index(
            "created_at"
        )  # TTL applied by apply_retention_ttl_indexes

        # Rate limit indexes
        await db.rate_limits.create_index("key", unique=True)
        await db.rate_limits.create_index(
            "reset_at", expireAfterSeconds=300  # TTL: 5 min
        )

        # Deployment indexes
        await db.deployments.create_index([("user_id", 1), ("project_id", 1), ("created_at", -1)])

        # Audit log indexes
        await db.audit_logs.create_index([("actor_id", 1), ("created_at", -1)])
        await db.audit_logs.create_index("created_at")  # TTL (1y) applied by apply_retention_ttl_indexes

        # Notification indexes
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])

        # Security events indexes
        await db.security_events.create_index([("severity", 1), ("created_at", -1)])
        await db.security_events.create_index(
            "created_at"
        )  # TTL applied by apply_retention_ttl_indexes

        # Onboarding progress indexes
        await db.onboarding_progress.create_index([("user_id", 1)], unique=True)

        # Referrals indexes
        await db.referrals.create_index([("referrer_id", 1), ("created_at", -1)])

        # Feature flags index
        await db.feature_flags.create_index("key", unique=True)

        # LLM per-agent model/provider override index
        await db.llm_agent_overrides.create_index("agent", unique=True)

        # API keys index
        await db.api_keys.create_index([("user_id", 1)])
        await db.api_keys.create_index([("key_hash", 1)], unique=True)

        # Token blacklist index (JTI-based)
        await db.token_blacklist.create_index([("jti", 1)], unique=True)
        await db.token_blacklist.create_index(
            "created_at"
        )  # TTL (24h) applied by apply_retention_ttl_indexes

        # Webhooks index
        await db.webhooks.create_index([("user_id", 1)])

        # AI usage indexes (AI-001)
        await db.ai_usage.create_index([("user_id", 1), ("created_at", -1)])
        await db.ai_usage.create_index([("org_id", 1), ("created_at", -1)])
        await db.ai_usage.create_index(
            "created_at"
        )  # TTL (90d) applied by apply_retention_ttl_indexes

        # --- Agile PM layer ---
        await db.initiatives.create_index([("user_id", 1), ("updated_at", -1)])
        await db.initiatives.create_index([("id", 1)])
        await db.prds.create_index([("initiative_id", 1)], unique=True)
        await db.epics.create_index([("initiative_id", 1), ("order", 1)])
        await db.stories.create_index([("epic_id", 1), ("order", 1)])
        await db.stories.create_index([("initiative_id", 1)])
        await db.tasks.create_index([("initiative_id", 1), ("status", 1), ("kanban_order", 1)])
        await db.tasks.create_index([("story_id", 1)])
        await db.tasks.create_index([("sprint_id", 1)])
        await db.sprints.create_index([("initiative_id", 1), ("sprint_number", 1)])
        await db.standups.create_index([("sprint_id", 1), ("date", -1)])
        await db.sprint_reviews.create_index([("sprint_id", 1), ("created_at", -1)])
        await db.sprint_retros.create_index([("sprint_id", 1), ("created_at", -1)])
        await db.risk_reports.create_index([("initiative_id", 1), ("created_at", -1)])
        await db.tech_debt_summaries.create_index([("initiative_id", 1), ("created_at", -1)])
        await db.agent_executions.create_index([("initiative_id", 1), ("created_at", -1)])
        await db.agent_executions.create_index([("task_id", 1)])
        await db.releases.create_index([("initiative_id", 1), ("created_at", -1)])
        await db.decision_log.create_index([("initiative_id", 1), ("created_at", -1)])
    except Exception:
        logger.exception("Failed to ensure one or more MongoDB indexes")
        raise


class PaginatedResult(BaseModel):
    """Standard paginated response envelope for list endpoints (BE-003).

    Every list endpoint returns ``items`` (the page's documents), ``total``
    (matching documents across all pages), ``page`` (1-indexed), ``per_page``
    (clamped to max 100), and ``total_pages`` so clients can build navigation
    without guessing.
    """
    items: list
    total: int
    page: int
    per_page: int
    total_pages: int


async def paginated_query(
    collection,
    query: dict,
    page: int = 1,
    per_page: int = 20,
    sort: Optional[list] = None,
    projection: Optional[dict] = None,
    max_page_size: int = 100,
) -> PaginatedResult:
    """Execute a paginated MongoDB find with consistent envelope.

    Parameters
    ----------
    collection : MotorCollection
        The AsyncIOMotorCollection to query (e.g. ``db.projects``).
    query : dict
        MongoDB filter dict.
    page : int
        1-indexed page number (clamped to >= 1).
    per_page : int
        Items per page (clamped to 1..max_page_size).
    sort : list, optional
        Sort spec, e.g. ``[("created_at", -1)]``.
    projection : dict, optional
        Field projection, e.g. ``{"_id": 0}``.
    max_page_size : int
        Upper bound for ``per_page``.

    Returns
    -------
    PaginatedResult
        Standard envelope with items, total, page, per_page, total_pages.
    """
    page = max(page, 1)
    per_page = max(1, min(per_page, max_page_size))

    total = await collection.count_documents(query)
    total_pages = max(1, (total + per_page - 1) // per_page) if total > 0 else 1
    # If client asks for a page beyond what exists, return the last page
    # rather than an empty response that looks like "no data".
    if page > total_pages:
        page = total_pages

    cursor = collection.find(query, projection or {"_id": 0})
    if sort:
        cursor = cursor.sort(sort)
    cursor = cursor.skip((page - 1) * per_page).limit(per_page)
    items = await cursor.to_list(length=per_page)

    return PaginatedResult(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


async def cache_get(key: str, ttl: int = 300) -> Optional[str]:
    """Get value from Redis cache."""
    try:
        redis = await get_redis()
        return await redis.get(key)
    except Exception:
        return None


async def cache_set(key: str, value: str, ttl: int = 300) -> None:
    """Set value in Redis cache."""
    try:
        redis = await get_redis()
        await redis.setex(key, ttl, value)
    except Exception:
        pass


async def cache_get_json(key: str) -> Optional[Union[dict, list]]:
    """Get a JSON-decoded value from Redis cache. Fail-open: returns None on
    any Redis error or JSON decode error."""
    try:
        raw = await cache_get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        return None


async def cache_set_json(key: str, value: Union[dict, list], ttl: int = 300) -> None:
    """JSON-encode and store a value in Redis cache. Fail-open: never raises."""
    try:
        raw = json.dumps(value, default=str)
        await cache_set(key, raw, ttl=ttl)
    except Exception:
        pass


async def get_redis():
    global _redis_client
    if _redis_client is None:
        # INF-008: bounded pool + timeouts. max_connections caps the pool so it
        # cannot grow unbounded, and socket timeouts ensure a hung Redis
        # connection fails fast instead of blocking the request forever.
        _redis_client = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=50,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
    return _redis_client


async def close_connections():
    global _mongo_client, _redis_client
    if _mongo_client:
        _mongo_client.close()
    if _redis_client:
        await _redis_client.aclose()
