"""In-memory pub/sub used to stream run progress to WebSocket clients.

Each run gets a fan-out of asyncio Queues. The runner publishes plain dict
events (``agent_started``, ``agent_done``, ``consolidating``, ``complete``,
``error``); the WS handler subscribes and forwards them. Events are also
buffered so a client that connects slightly late still receives the history.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

_TERMINAL = {"complete", "error"}


class EventBus:
    def __init__(self, buffer_size: int = 200) -> None:
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._history: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._finished: set[str] = set()
        self._buffer_size = buffer_size

    async def publish(self, run_id: str, event: dict[str, Any]) -> None:
        self._history[run_id].append(event)
        if len(self._history[run_id]) > self._buffer_size:
            self._history[run_id] = self._history[run_id][-self._buffer_size :]
        for q in list(self._subscribers.get(run_id, [])):
            await q.put(event)
        if event.get("type") in _TERMINAL:
            self._finished.add(run_id)

    def subscribe(self, run_id: str) -> tuple[asyncio.Queue, list[dict[str, Any]]]:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers[run_id].append(q)
        return q, list(self._history.get(run_id, []))

    def unsubscribe(self, run_id: str, q: asyncio.Queue) -> None:
        subs = self._subscribers.get(run_id)
        if subs and q in subs:
            subs.remove(q)
        if subs is not None and not subs:
            self._subscribers.pop(run_id, None)

    def is_finished(self, run_id: str) -> bool:
        return run_id in self._finished


# Process-wide singleton (single-process deployment). For multi-worker
# deployments swap this for a Redis pub/sub with the same interface.
bus = EventBus()
