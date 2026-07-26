import asyncio
import json
import uuid
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect
from typing import Dict, List, Optional

from agent_registry.ws_events import OrgEvent
from core.database import get_db, get_redis
from core.permissions import has_project_access
from core.models import User
from auth import decode_token

MAX_WS_PAYLOAD_BYTES = 5 * 1024 * 1024
WS_AUTH_TIMEOUT_SECONDS = 10


class OrgConnectionManager:
    """Redis-pub/sub-bridged WebSocket fanout for project_id-scoped
    engineering-org events -- same design as services/ws_manager.py's
    ConnectionManager (build_id-scoped) and services/pm_ws_manager.py's
    PMConnectionManager (initiative_id-scoped), kept as a separate instance
    so this feature never has to touch either already-hardened path."""

    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}
        self._redis = None
        self._instance_id = str(uuid.uuid4())
        self._pubsub_task: Optional[asyncio.Task] = None

    async def _get_redis(self):
        if self._redis is None:
            self._redis = await get_redis()
        return self._redis

    async def connect(self, websocket: WebSocket, project_id: str):
        self.active.setdefault(project_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str):
        if project_id in self.active:
            self.active[project_id] = [ws for ws in self.active[project_id] if ws != websocket]
            if not self.active[project_id]:
                del self.active[project_id]

    async def _deliver_local(self, project_id: str, payload: str):
        connections = self.active.get(project_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, project_id)

    async def _publish(self, project_id: str, payload: str):
        await self._deliver_local(project_id, payload)
        try:
            redis = await self._get_redis()
            envelope = json.dumps({"_origin": self._instance_id, "data": payload})
            await redis.publish(f"org:{project_id}", envelope)
        except Exception:
            pass

    async def emit(self, event: OrgEvent):
        payload = event.model_dump_json()
        if len(payload.encode("utf-8")) > MAX_WS_PAYLOAD_BYTES:
            return
        await self._publish(event.project_id, payload)

    async def start_pubsub_listener(self):
        redis = await self._get_redis()
        pubsub = redis.pubsub()
        await pubsub.psubscribe("org:*")
        try:
            async for message in pubsub.listen():
                if message.get("type") != "pmessage":
                    continue
                try:
                    channel = message["channel"]
                    if isinstance(channel, bytes):
                        channel = channel.decode()
                    project_id = channel.split(":", 1)[1]
                    raw = message["data"]
                    if isinstance(raw, bytes):
                        raw = raw.decode()
                    envelope = json.loads(raw)
                except Exception:
                    continue
                if envelope.get("_origin") == self._instance_id:
                    continue
                await self._deliver_local(project_id, envelope.get("data", ""))
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.punsubscribe("org:*")
            await pubsub.aclose()

    def start(self):
        if self._pubsub_task is None or self._pubsub_task.done():
            self._pubsub_task = asyncio.create_task(self.start_pubsub_listener())

    async def close_all_connections(self, reason: str = "Server shutting down") -> None:
        for project_id in list(self.active.keys()):
            for ws in list(self.active.get(project_id, [])):
                try:
                    await ws.close(code=1011, reason=reason)
                except Exception:
                    pass
        self.active.clear()

    async def stop(self):
        await self.close_all_connections()
        if self._pubsub_task is not None:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except (asyncio.CancelledError, Exception):
                pass
            self._pubsub_task = None


org_manager = OrgConnectionManager()


def get_org_manager() -> OrgConnectionManager:
    return org_manager


async def authenticate_org_websocket(websocket: WebSocket, project_id: str) -> Optional[User]:
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

    project_doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project_doc or not await has_project_access(db, user_id, project_doc):
        await websocket.close(code=4001, reason="Foreign project")
        return None

    return User(**user_doc)
