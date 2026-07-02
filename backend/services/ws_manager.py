import asyncio
import json
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

    async def emit(self, event: WSEvent):
        payload = event.model_dump_json()
        if len(payload.encode("utf-8")) > MAX_WS_PAYLOAD_BYTES:
            return

        try:
            redis = await self._get_redis()
            await redis.publish(f"build:{event.build_id}", payload)
        except Exception:
            pass

        connections = self.active.get(event.build_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, event.build_id)

    async def broadcast(self, build_id: str, data: dict):
        payload = json.dumps(data)
        if len(payload.encode("utf-8")) > MAX_WS_PAYLOAD_BYTES:
            return

        try:
            redis = await self._get_redis()
            await redis.publish(f"build:{build_id}", payload)
        except Exception:
            pass

        connections = self.active.get(build_id, [])
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                pass


manager = ConnectionManager()


async def get_ws_user(token: Optional[str] = Query(None), build_id: Optional[str] = None) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    payload = decode_token(token)
    if not payload or payload.get("type") not in ("access", "ws"):
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
    if not payload or payload.get("type") not in ("access", "ws"):
        await websocket.close(code=4001, reason="Invalid token")
        return None

    user_id = payload.get("sub")
    db = await get_db()
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        await websocket.close(code=4001, reason="User not found")
        return None

    build_doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
    if not build_doc or not await has_build_access(db, user_id, build_doc):
        await websocket.close(code=4001, reason="Foreign build")
        return None

    return User(**user_doc)
