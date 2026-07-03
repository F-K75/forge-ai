import asyncio
import json
import hmac
import hashlib
from typing import Dict, Any
from datetime import datetime

import httpx

from core.config import get_settings
from core.database import get_db, get_redis

settings = get_settings()


async def deliver_webhook(url: str, payload: Dict[str, Any], secret: str) -> bool:
    """Deliver a webhook to a URL with HMAC signature."""
    timestamp = str(int(datetime.utcnow().timestamp()))
    body = json.dumps(payload, separators=(",", ":"))
    
    signature = hmac.new(
        secret.encode(),
        f"{timestamp}.{body}".encode(),
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        "Content-Type": "application/json",
        "X-Forge-Timestamp": timestamp,
        "X-Forge-Signature": f"v1={signature}",
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, data=body, headers=headers)
            return response.status_code in (200, 201, 204)
    except Exception:
        return False


async def queue_webhook_delivery(
    user_id: str,
    event_type: str,
    payload: Dict[str, Any]
) -> None:
    """Queue webhook for delivery via background worker."""
    redis = await get_redis()
    db = await get_db()
    
    # Get user webhooks
    webhooks = await db.webhooks.find({"user_id": user_id, "active": True}).to_list(10)
    
    for webhook in webhooks:
        queue_item = {
            "id": f"wh_{datetime.utcnow().timestamp()}",
            "webhook_id": webhook["id"],
            "url": webhook["url"],
            "secret": webhook["secret"],
            "event_type": event_type,
            "payload": payload,
            "attempts": 0,
            "max_attempts": 3,
            "created_at": datetime.utcnow(),
        }
        await redis.lpush("webhook_queue", json.dumps(queue_item))


async def process_webhook_queue() -> None:
    """Process webhook delivery queue - should run as background worker."""
    redis = await get_redis()
    
    while True:
        try:
            item_json = await redis.brpop("webhook_queue", timeout=10)
            if not item_json:
                continue
            
            item = json.loads(item_json[1])
            success = await deliver_webhook(
                item["url"],
                item["payload"],
                item["secret"]
            )
            
            if not success:
                item["attempts"] += 1
                if item["attempts"] < item["max_attempts"]:
                    await redis.lpush("webhook_queue", json.dumps(item))
        except Exception:
            await asyncio.sleep(1)


def init_webhook_worker():
    """Initialize webhook delivery worker."""
    asyncio.create_task(process_webhook_queue())