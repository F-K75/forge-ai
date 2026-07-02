from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis
from core.config import get_settings
from typing import Optional
import asyncio
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
                    serverSelectionTimeoutMS=5000,
                    connectTimeoutMS=10000,
                )
                await _ensure_indexes(_mongo_client.forge)
    return _mongo_client.forge


async def _ensure_indexes(db):
    try:
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

        # Build files indexes
        await db.build_files.create_index([("build_id", 1), ("path", 1)], unique=True)
        await db.build_files.create_index([("build_id", 1)])
        await db.build_files.create_index("created_at", expireAfterSeconds=7776000)  # TTL: 90 days

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
            "created_at", expireAfterSeconds=7776000  # TTL: 90 days
        )

        # Rate limit indexes
        await db.rate_limits.create_index("key", unique=True)
        await db.rate_limits.create_index(
            "reset_at", expireAfterSeconds=300  # TTL: 5 min
        )

        # Deployment indexes
        await db.deployments.create_index([("user_id", 1), ("project_id", 1), ("created_at", -1)])

        # Audit log indexes
        await db.audit_logs.create_index([("actor_id", 1), ("created_at", -1)])
        await db.audit_logs.create_index("created_at", expireAfterSeconds=31536000)  # TTL: 1 year

        # Notification indexes
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])

        # Security events indexes
        await db.security_events.create_index([("severity", 1), ("created_at", -1)])
        await db.security_events.create_index(
            "created_at", expireAfterSeconds=7776000  # TTL: 90 days
        )

        # Onboarding progress indexes
        await db.onboarding_progress.create_index([("user_id", 1)], unique=True)

        # Referrals indexes
        await db.referrals.create_index([("referrer_id", 1), ("created_at", -1)])

        # Feature flags index
        await db.feature_flags.create_index("key", unique=True)

        # API keys index
        await db.api_keys.create_index([("user_id", 1)])
        await db.api_keys.create_index([("key_hash", 1)], unique=True)

        # Token blacklist index (JTI-based)
        await db.token_blacklist.create_index([("jti", 1)], unique=True)
        await db.token_blacklist.create_index(
            "created_at", expireAfterSeconds=86400  # TTL: 24 hours
        )

        # Webhooks index
        await db.webhooks.create_index([("user_id", 1)])
    except Exception:
        logger.exception("Failed to ensure one or more MongoDB indexes")


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


async def get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(
            settings.redis_url, decode_responses=True
        )
    return _redis_client


async def close_connections():
    global _mongo_client, _redis_client
    if _mongo_client:
        _mongo_client.close()
    if _redis_client:
        await _redis_client.aclose()
