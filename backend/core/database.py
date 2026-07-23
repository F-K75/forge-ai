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

        # Collect all index-creation coroutines so they run concurrently.
        # When MongoDB is unreachable, each create_index call would otherwise
        # wait serverSelectionTimeoutMS (5s) before failing; running them in
        # parallel collapses the total slow-fail window from ~175s to ~5s.
        index_coroutines = [
            # User indexes
            db.users.create_index("email", unique=True),
            db.users.create_index([("id", 1)]),
            # Organization indexes
            db.organizations.create_index("slug", unique=True),
            # Project indexes
            db.projects.create_index([("user_id", 1), ("updated_at", -1)]),
            db.projects.create_index([("id", 1)]),
            # Build indexes
            db.builds.create_index([("project_id", 1), ("user_id", 1), ("created_at", -1)]),
            db.builds.create_index([("id", 1)]),
            db.builds.create_index([("user_id", 1), ("created_at", -1)]),
            # Idempotency key index (BUS-007): unique per user so a retry with the
            # same key never creates a duplicate build. Partial index so null keys
            # (builds created without an idempotency_key) don't collide.
            db.builds.create_index(
                [("user_id", 1), ("idempotency_key", 1)],
                unique=True,
                partialFilterExpression={"idempotency_key": {"$exists": True}},
            ),
            # Build files indexes
            db.build_files.create_index([("build_id", 1), ("path", 1)], unique=True),
            db.build_files.create_index([("build_id", 1)]),
            # Team member indexes
            db.team_members.create_index([("org_id", 1), ("user_id", 1)], unique=True),
            # LLM org policy override indexes
            db.llm_org_policy_overrides.create_index("org_id", unique=True),
            # Budget manager indexes
            db.budget_limits.create_index([("scope", 1), ("scope_id", 1)], unique=True),
            # Semantic retrieval indexes
            db.semantic_chunks.create_index("id", unique=True),
            db.semantic_chunks.create_index([("source_id", 1)]),
            db.semantic_chunks.create_index([("org_id", 1), ("project_id", 1), ("source_type", 1)]),
            # Subscription indexes
            db.subscriptions.create_index("stripe_subscription_id", unique=True),
            db.subscriptions.create_index([("user_id", 1)]),
            # Invitation indexes
            db.invitations.create_index("hashed_token", unique=True),
            db.invitations.create_index([("org_id", 1)]),
            # Credit purchase indexes
            db.credit_purchases.create_index("stripe_payment_intent_id", unique=True),
            # Marketplace indexes
            db.marketplace_items.create_index([("type", 1), ("is_public", 1), ("downloads", -1)]),
            db.marketplace_items.create_index([("title", "text"), ("description", "text")]),
            # Analytics indexes
            db.analytics_events.create_index([("user_id", 1), ("event_name", 1), ("created_at", -1)]),
            # Rate limit indexes
            db.rate_limits.create_index("key", unique=True),
            db.rate_limits.create_index("reset_at", expireAfterSeconds=300),
            # Deployment indexes
            db.deployments.create_index([("user_id", 1), ("project_id", 1), ("created_at", -1)]),
            # Audit log indexes
            db.audit_logs.create_index([("actor_id", 1), ("created_at", -1)]),
            # Notification indexes
            db.notifications.create_index([("user_id", 1), ("created_at", -1)]),
            # Security events indexes
            db.security_events.create_index([("severity", 1), ("created_at", -1)]),
            # Onboarding progress indexes
            db.onboarding_progress.create_index([("user_id", 1)], unique=True),
            # Referrals indexes
            db.referrals.create_index([("referrer_id", 1), ("created_at", -1)]),
            # Feature flags index
            db.feature_flags.create_index("key", unique=True),
            # LLM per-agent model/provider override index
            db.llm_agent_overrides.create_index("agent", unique=True),
            # API keys index
            db.api_keys.create_index([("user_id", 1)]),
            db.api_keys.create_index([("key_hash", 1)], unique=True),
            # Token blacklist index (JTI-based)
            db.token_blacklist.create_index([("jti", 1)], unique=True),
            # Webhooks index
            db.webhooks.create_index([("user_id", 1)]),
            # AI usage indexes (AI-001)
            db.ai_usage.create_index([("user_id", 1), ("created_at", -1)]),
            db.ai_usage.create_index([("org_id", 1), ("created_at", -1)]),
            # --- Agile PM layer ---
            db.initiatives.create_index([("user_id", 1), ("updated_at", -1)]),
            db.initiatives.create_index([("id", 1)]),
            db.prds.create_index([("initiative_id", 1)], unique=True),
            db.epics.create_index([("initiative_id", 1), ("order", 1)]),
            db.stories.create_index([("epic_id", 1), ("order", 1)]),
            db.stories.create_index([("initiative_id", 1)]),
            db.tasks.create_index([("initiative_id", 1), ("status", 1), ("kanban_order", 1)]),
            db.tasks.create_index([("story_id", 1)]),
            db.tasks.create_index([("sprint_id", 1)]),
            db.sprints.create_index([("initiative_id", 1), ("sprint_number", 1)]),
            db.standups.create_index([("sprint_id", 1), ("date", -1)]),
            db.sprint_reviews.create_index([("sprint_id", 1), ("created_at", -1)]),
            db.sprint_retros.create_index([("sprint_id", 1), ("created_at", -1)]),
            db.risk_reports.create_index([("initiative_id", 1), ("created_at", -1)]),
            db.tech_debt_summaries.create_index([("initiative_id", 1), ("created_at", -1)]),
            db.agent_executions.create_index([("initiative_id", 1), ("created_at", -1)]),
            db.agent_executions.create_index([("task_id", 1)]),
            db.releases.create_index([("initiative_id", 1), ("created_at", -1)]),
            db.decision_log.create_index([("initiative_id", 1), ("created_at", -1)]),
            # --- Agent Registry (persistent engineering org per project) ---
            db.engineering_orgs.create_index("project_id", unique=True),
            db.agent_profiles.create_index([("project_id", 1), ("role", 1)], unique=True),
            db.agent_profiles.create_index([("id", 1)]),
            # --- Team Chat (agent communication layer) ---
            db.team_messages.create_index([("project_id", 1), ("created_at", 1)]),
            db.team_messages.create_index([("project_id", 1), ("thread_id", 1)]),
            db.team_messages.create_index([("id", 1)], unique=True),
        ]

        results = await asyncio.gather(*index_coroutines, return_exceptions=True)

        failures = [r for r in results if isinstance(r, BaseException)]
        if failures:
            for failure in failures:
                logger.error("Failed to create MongoDB index: %s", failure, exc_info=failure)
            raise failures[0]
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
