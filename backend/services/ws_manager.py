import json
from fastapi import WebSocket, Query, HTTPException
from typing import Dict, List, Optional

from core.models import WSEvent, User
from core.database import get_db
from core.permissions import has_build_access
from auth import decode_token

MAX_WS_PAYLOAD_BYTES = 5 * 1024 * 1024


class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, build_id: str):
        # WebSocket auth/ownership MUST be verified before calling connect().
        # Accept happens only after verification.
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

    # Optionally validate build access here to prevent cross-build leakage.
    if build_id:
        build_doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
        if not build_doc or not await has_build_access(db, user_id, build_doc):
            raise HTTPException(status_code=403, detail="Foreign build")

    return User(**user_doc)

