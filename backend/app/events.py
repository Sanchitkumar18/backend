"""Async helpers that serialize + fan out real-time events over WebSockets.

These are awaited from the (async) REST routers after DB writes commit, so the
UI updates live for every participant.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ConversationMember, Message
from .realtime import manager
from .serializers import (
    member_user_ids,
    serialize_conversation,
    serialize_message,
)


async def emit_new_message(db: Session, msg: Message) -> None:
    member_ids = member_user_ids(db, msg.conversation_id)
    for uid in member_ids:
        await manager.send_to_user(
            uid,
            {
                "type": "message:new",
                "data": serialize_message(db, msg, for_user_id=uid),
            },
        )


async def emit_message_update(db: Session, msg: Message) -> None:
    """Edit / delete / reaction change."""
    for uid in member_user_ids(db, msg.conversation_id):
        await manager.send_to_user(
            uid,
            {
                "type": "message:update",
                "data": serialize_message(db, msg, for_user_id=uid),
            },
        )


async def emit_conversation_update(db: Session, conversation_id: int) -> None:
    from .models import Conversation

    conv = db.get(Conversation, conversation_id)
    if conv is None:
        return
    for uid in member_user_ids(db, conversation_id):
        await manager.send_to_user(
            uid,
            {
                "type": "conversation:update",
                "data": serialize_conversation(db, conv, uid),
            },
        )


async def push_status_updates(db: Session, conversation_id: int, actor_id: int) -> None:
    """After `actor_id` marks messages delivered/read, tell each original
    sender the recomputed aggregate status of their affected messages."""
    msgs = db.scalars(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.sender_id.is_not(None),
            Message.sender_id != actor_id,
        )
    ).all()
    for m in msgs:
        payload = serialize_message(db, m, for_user_id=m.sender_id)
        await manager.send_to_user(
            m.sender_id,
            {
                "type": "message:status",
                "data": {
                    "id": m.id,
                    "conversation_id": conversation_id,
                    "status": payload["status"],
                },
            },
        )
