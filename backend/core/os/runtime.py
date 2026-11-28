"""The OS service container: one per process, injected into ``api/os.py``.

Tests build an ``OsRuntime`` over in-memory fakes and override the
``get_os_runtime`` dependency; production builds it lazily from
``core.database``.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, Optional

from core.os.attachments import AttachmentRepository
from core.os.capability_registry import CapabilityRegistry, get_capability_registry
from core.os.events import EventBus, EventLog, SessionEvents
from core.os.sessions import (
    MessageRepository,
    SessionRepository,
    SurfaceRepository,
    TurnRepository,
    WorkspaceRepository,
)

logger = logging.getLogger(__name__)


def _default_gateway():
    from gateway.service import get_ai_gateway

    return get_ai_gateway()


class OsRuntime:
    def __init__(
        self,
        db,
        *,
        redis_getter: Optional[Callable[[], Awaitable[Any]]] = None,
        gateway_getter: Optional[Callable[[], Any]] = None,
        registry: Optional[CapabilityRegistry] = None,
        kernel_runner: Any = None,
        mcp_gateway_getter: Optional[Callable[[], Any]] = None,
        agui_broker_getter: Optional[Callable[[], Any]] = None,
    ):
        self.db = db
        self.redis_getter = redis_getter
        self.gateway_getter = gateway_getter or _default_gateway
        self.registry = registry or get_capability_registry()
        self.sessions = SessionRepository(db)
        self.messages = MessageRepository(db)
        self.turns = TurnRepository(db)
        self.surfaces = SurfaceRepository(db)
        self.workspaces = WorkspaceRepository(db)
        self.attachments = AttachmentRepository(db)
        self.events = SessionEvents(EventLog(db), EventBus(redis_getter))
        self.kernel_runner = kernel_runner
        self.mcp_gateway_getter = mcp_gateway_getter
        self.agui_broker_getter = agui_broker_getter
        # turn_id -> task running on this worker (for cancel)
        self.tasks: Dict[str, asyncio.Task] = {}
        # Background bridges (kernel run -> agent.progress) keyed by run id.
        self.bridges: Dict[str, asyncio.Task] = {}

    @property
    def gateway(self):
        return self.gateway_getter()

    async def emit(self, *, session_id: str, user_id: str, turn_id: Optional[str], type: str, data: Dict[str, Any]):
        return await self.events.emit(session_id=session_id, user_id=user_id, turn_id=turn_id, type=type, data=data)


_runtime: Optional[OsRuntime] = None
_lock = asyncio.Lock()


async def get_os_runtime() -> OsRuntime:
    global _runtime
    if _runtime is None:
        async with _lock:
            if _runtime is None:
                from core.database import get_db, get_redis

                db = await get_db()
                _runtime = OsRuntime(db, redis_getter=get_redis)
    return _runtime
