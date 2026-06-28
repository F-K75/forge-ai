from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis
from core.config import get_settings

settings = get_settings()

_mongo_client: AsyncIOMotorClient = None
_redis_client: Redis = None


async def get_db():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(settings.mongodb_url)
        _ensure_indexes(_mongo_client.forge)
    return _mongo_client.forge


async def _ensure_indexes(db):
    try:
        await db.users.create_index("email", unique=True)
        await db.organizations.create_index("slug", unique=True)
        await db.subscriptions.create_index(
            "stripe_subscription_id", unique=True
        )
        await db.invitations.create_index(
            "hashed_token", unique=True
        )
        await db.credit_purchases.create_index(
            "stripe_payment_intent_id", unique=True
        )
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
