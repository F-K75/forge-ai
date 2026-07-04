import asyncio
import json
import uuid
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect
from typing import Dict, List, Optional

from core.pm_models import PMWSEvent
from core.database import get_db, get_redis
from core.permissions import has_initiative_access
from auth import decode_token

MAX_WS_PAYLOAD_BYTES = 5 * 1024 * 1024
WS_AUTH_TIMEOUT_SECONDS = 10


class PMConnectionManager:
    """Redis-pub/sub-bridged WebSocket fanout for initiative-scoped events --
    same design as services/ws_manager.py's ConnectionManager (which is
    build_id-scoped), kept as a separate instance so this feature never has
    to touch that already-hardened, heavily-tested path."""

    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}
        self._redis = None
        self._instance_id = str(uuid.uuid4())
        self._pubsub_task: Optional[asyncio.Task] = None

    async def _get_redis(self):
        if self._redis is None:
            self._redis = await get_redis()
        return self._redis

    async def connect(self, websocket: WebSocket, initiative_id: str):
        self.active.setdefault(initiative_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, initiative_id: str):
        if initiative_id in self.active:
            self.active[initiative_id] = [ws for ws in self.active[initiative_id] if ws != websocket]
            if not self.active[initiative_id]:
                del self.active[initiative_id]

    async def _deliver_local(self, initiative_id: str, payload: str):
        connections = self.active.get(initiative_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, initiative_id)

    async def _publish(self, initiative_id: str, payload: str):
        await self._deliver_local(initiative_id, payload)
        try:
            redis = await self._get_redis()
            envelope = json.dumps({"_origin": self._instance_id, "data": payload})
            await redis.publish(f"pm:{initiative_id}", envelope)
        except Exception:
            pass

    async def emit(self, event: PMWSEvent):
        payload = event.model_dump_json()
        if len(payload.encode("utf-8")) > MAX_WS_PAYLOAD_BYTES:
            return
        await self._publish(event.initiative_id, payload)

    async def start_pubsub_listener(self):
        redis = await self._get_redis()
        pubsub = redis.pubsub()
        await pubsub.psubscribe("pm:*")
        try:
            async for message in pubsub.listen():
                if message.get("type") != "pmessage":
                    continue
                try:
                    channel = message["channel"]
                    if isinstance(channel, bytes):
                        channel = channel.decode()
                    initiative_id = channel.split(":", 1)[1]
                    raw = message["data"]
                    if isinstance(raw, bytes):
                        raw = raw.decode()
                    envelope = json.loads(raw)
                except Exception:
                    continue
                if envelope.get("_origin") == self._instance_id:
                    continue
                await self._deliver_local(initiative_id, envelope.get("data", ""))
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.punsubscribe("pm:*")
            await pubsub.aclose()

    def start(self):
        if self._pubsub_task is None or self._pubsub_task.done():
            self._pubsub_task = asyncio.create_task(self.start_pubsub_listener())

    async def stop(self):
        if self._pubsub_task is not None:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except (asyncio.CancelledError, Exception):
                pass
            self._pubsub_task = None


pm_manager = PMConnectionManager()


async def authenticate_pm_websocket(websocket: WebSocket, initiative_id: str):
    await websocket.accept()
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=WS_AUTH_TIMEOUT_SECONDS)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        await websocket.close(code=4001, reason="Auth timeout")
        return None

    try:
        msg = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        await websocket.close(code=4001, reason="Invalid auth message")
        return None

    if not isinstance(msg, dict) or msg.get("type") != "auth" or not msg.get("token"):
        await websocket.close(code=4001, reason="Expected auth message")
        return None

    payload = decode_token(msg["token"])
    if not payload or payload.get("type") not in ("access", "ws"):
        await websocket.close(code=4001, reason="Invalid token")
        return None

    user_id = payload.get("sub")
    db = await get_db()
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        await websocket.close(code=4001, reason="User not found")
        return None

    initiative_doc = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative_doc or not await has_initiative_access(db, user_id, initiative_doc):
        await websocket.close(code=4001, reason="Foreign initiative")
        return None

    return user_doc
