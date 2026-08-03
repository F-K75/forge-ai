import asyncio
import json
import uuid
from fastapi import WebSocket, Query, HTTPException
from starlette.websockets import WebSocketDisconnect
from typing import Dict, List, Optional

from core.models import WSEvent, User
from core.database import get_db, get_redis
from core.permissions import has_build_access
from auth import decode_token

MAX_WS_PAYLOAD_BYTES = 5 * 1024 * 1024
WS_AUTH_TIMEOUT_SECONDS = 10


class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}
        self._redis = None
        # Tags messages this process publishes so its own pub/sub listener
        # can skip them — they're already delivered by _deliver_local below.
        self._instance_id = str(uuid.uuid4())
        self._pubsub_task: Optional[asyncio.Task] = None

    async def _get_redis(self):
        if self._redis is None:
            self._redis = await get_redis()
        return self._redis

    async def connect(self, websocket: WebSocket, build_id: str):
        self.active.setdefault(build_id, []).append(websocket)

    async def accept(self, websocket: WebSocket):
        await websocket.accept()

    def disconnect(self, websocket: WebSocket, build_id: str):
        if build_id in self.active:
            self.active[build_id] = [
                ws for ws in self.active[build_id] if ws != websocket
            ]
            if not self.active[build_id]:
                del self.active[build_id]

    async def _deliver_local(self, build_id: str, payload: str):
        connections = self.active.get(build_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, build_id)

    async def _publish(self, build_id: str, payload: str):
        # Deliver directly to any connections this process holds first, so
        # same-process delivery never depends on the pub/sub round trip (and
        # still works if Redis is briefly unreachable).
        await self._deliver_local(build_id, payload)

        try:
            redis = await self._get_redis()
            envelope = json.dumps({"_origin": self._instance_id, "data": payload})
            await redis.publish(f"build:{build_id}", envelope)
        except Exception:
            pass

    async def emit(self, event: WSEvent):
        payload = event.model_dump_json()
        if len(payload.encode("utf-8")) > MAX_WS_PAYLOAD_BYTES:
            return
        await self._publish(event.build_id, payload)

    async def broadcast(self, build_id: str, data: dict):
        payload = json.dumps(data)
        if len(payload.encode("utf-8")) > MAX_WS_PAYLOAD_BYTES:
            return
        await self._publish(build_id, payload)

    async def start_pubsub_listener(self):
        """Bridge Redis pub/sub to this process's local WebSocket connections.

        emit()/broadcast() only deliver directly to connections held by the
        *same* process that calls them. Build-progress events are emitted
        from the Celery worker process, which never holds any real WebSocket
        connections itself — only the FastAPI web process(es) do. Without
        this listener, every event from a worker (or any other web instance)
        was silently dropped for every connected client, regardless of
        instance count. Messages tagged with this process's own instance id
        are skipped since _publish already delivered them locally.
        """
        redis = await self._get_redis()
        pubsub = redis.pubsub()
        await pubsub.psubscribe("build:*")
        try:
            async for message in pubsub.listen():
                if message.get("type") != "pmessage":
                    continue
                try:
                    channel = message["channel"]
                    if isinstance(channel, bytes):
                        channel = channel.decode()
                    build_id = channel.split(":", 1)[1]
                    raw = message["data"]
                    if isinstance(raw, bytes):
                        raw = raw.decode()
                    envelope = json.loads(raw)
                except Exception:
                    continue
                if envelope.get("_origin") == self._instance_id:
                    continue
                await self._deliver_local(build_id, envelope.get("data", ""))
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.punsubscribe("build:*")
            await pubsub.aclose()

    def start(self):
        if self._pubsub_task is None or self._pubsub_task.done():
            self._pubsub_task = asyncio.create_task(self.start_pubsub_listener())

    async def close_all_connections(self, reason: str = "Server shutting down") -> None:
        for build_id in list(self.active.keys()):
            for ws in list(self.active.get(build_id, [])):
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


manager = ConnectionManager()


async def get_ws_user(token: Optional[str] = Query(None), build_id: Optional[str] = None) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    payload = decode_token(token)
    if not payload or payload.get("type") != "ws":
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    db = await get_db()
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    if build_id:
        build_doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
        if not build_doc or not await has_build_access(db, user_id, build_doc):
            raise HTTPException(status_code=403, detail="Foreign build")

    return User(**user_doc)


async def authenticate_websocket(websocket: WebSocket, build_id: str) -> Optional[User]:
    await websocket.accept()

    try:
        raw = await asyncio.wait_for(
            websocket.receive_text(), timeout=WS_AUTH_TIMEOUT_SECONDS
        )
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
    if not payload or payload.get("type") != "ws":
        await websocket.close(code=4001, reason="Invalid token")
        return None

    user_id = payload.get("sub")
    db = await get_db()
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        await websocket.close(code=4001, reason="User not found")
        return None

    if build_id:
        build_doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
        if not build_doc or not await has_build_access(db, user_id, build_doc):
            await websocket.close(code=4001, reason="Foreign build")
            return None

    return User(**user_doc)


async def authenticate_websocket_token(token: Optional[str], build_id: Optional[str] = None) -> Optional[User]:
    """Validate a WebSocket token from query parameters BEFORE accepting the
    connection. Returns the authenticated User, or None if the token is
    missing/invalid.

    Only short-lived ``ws`` tokens (issued by POST /auth/ws-token) are
    accepted here. Access tokens are rejected even if otherwise valid so a
    leaked long-lived bearer token cannot be replayed as a WebSocket credential.
    """
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != "ws":
        return None
    user_id = payload.get("sub")
    db = await get_db()
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        return None

    if build_id:
        build_doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
        if not build_doc or not await has_build_access(db, user_id, build_doc):
            return None

    return User(**user_doc)
