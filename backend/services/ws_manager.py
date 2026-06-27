from fastapi import WebSocket
from typing import Dict, List
import json
from core.models import WSEvent


class ConnectionManager:
    def __init__(self):
        # build_id -> list of websockets
        self.active: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, build_id: str):
        await websocket.accept()
        self.active.setdefault(build_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, build_id: str):
        if build_id in self.active:
            self.active[build_id] = [
                ws for ws in self.active[build_id] if ws != websocket
            ]
            if not self.active[build_id]:
                del self.active[build_id]

    async def emit(self, event: WSEvent):
        """Send event to all clients subscribed to this build."""
        connections = self.active.get(event.build_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_text(event.model_dump_json())
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, event.build_id)

    async def broadcast(self, build_id: str, data: dict):
        connections = self.active.get(build_id, [])
        for ws in connections:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                pass


manager = ConnectionManager()
