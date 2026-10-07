"""In-memory WebSocket connection manager and event broadcaster.

One user may have several open sockets (multiple tabs). We keep a map of
user_id -> set[WebSocket] and fan events out to the relevant users. All events
share the shape: {"type": <event>, "data": {...}}.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[user_id].add(ws)

    async def disconnect(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[user_id].discard(ws)
            if not self._connections[user_id]:
                self._connections.pop(user_id, None)

    def is_online(self, user_id: int) -> bool:
        return user_id in self._connections

    def online_user_ids(self) -> list[int]:
        return list(self._connections.keys())

    async def send_to_user(self, user_id: int, message: dict) -> None:
        for ws in list(self._connections.get(user_id, set())):
            try:
                await ws.send_json(message)
            except Exception:
                # Socket is dead; drop it.
                await self.disconnect(user_id, ws)

    async def broadcast(self, user_ids: list[int], message: dict) -> None:
        for uid in set(user_ids):
            await self.send_to_user(uid, message)


manager = ConnectionManager()
