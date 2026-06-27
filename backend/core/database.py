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
    return _mongo_client.forge


async def get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


async def close_connections():
    global _mongo_client, _redis_client
    if _mongo_client:
        _mongo_client.close()
    if _redis_client:
        await _redis_client.aclose()
