"""Helpers to turn ORM objects into enriched JSON-ready dicts.

Shared by the REST routers and the WebSocket layer so both emit the same shape.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    Conversation,
    ConversationMember,
    ConversationType,
    Message,
    MessageReceipt,
    ReceiptStatus,
    User,
)


def serialize_user(u: User) -> dict:
    return {
        "id": u.id,
        "phone": u.phone,
        "username": u.username,
        "display_name": u.display_name,
        "about": u.about,
        "avatar_color": u.avatar_color,
        "avatar_url": u.avatar_url,
        "is_online": u.is_online,
        "last_seen": u.last_seen.isoformat() if u.last_seen else None,
    }


def message_status(db: Session, msg: Message) -> str:
    """Aggregate delivery status for the *sender's* view of their message.

    sent       -> persisted, no recipient has it yet
    delivered  -> every other active member has at least a delivered receipt
    read       -> every other active member has read it
    """
    recipient_ids = db.scalars(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == msg.conversation_id,
            ConversationMember.user_id != msg.sender_id,
            ConversationMember.is_active.is_(True),
        )
    ).all()
    if not recipient_ids:
        return "sent"

    receipts = db.scalars(
        select(MessageReceipt).where(MessageReceipt.message_id == msg.id)
    ).all()
    by_user = {r.user_id: r.status for r in receipts}

    if all(by_user.get(uid) == ReceiptStatus.READ for uid in recipient_ids):
        return "read"
    if all(
        by_user.get(uid) in (ReceiptStatus.DELIVERED, ReceiptStatus.READ)
        for uid in recipient_ids
    ):
        return "delivered"
    return "sent"


def serialize_message(
    db: Session, msg: Message, *, for_user_id: int | None = None
) -> dict:
    reply = None
    if msg.reply_to_id and msg.reply_to is not None:
        r = msg.reply_to
        reply = {
            "id": r.id,
            "sender_id": r.sender_id,
            "sender_name": r.sender.display_name if r.sender else None,
            "content": r.content,
            "type": r.type.value,
        }

    data = {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "type": msg.type.value,
        "content": msg.content if not msg.deleted else "",
        "attachment_url": msg.attachment_url,
        "attachment_name": msg.attachment_name,
        "reply_to_id": msg.reply_to_id,
        "edited": msg.edited,
        "deleted": msg.deleted,
        "created_at": msg.created_at.isoformat(),
        "reply_to": reply,
        "reactions": [
            {"user_id": rx.user_id, "emoji": rx.emoji} for rx in msg.reactions
        ],
        "status": None,
    }
    # Only the sender sees the check-mark status on their own messages.
    if msg.sender_id is not None and (
        for_user_id is None or for_user_id == msg.sender_id
    ):
        data["status"] = message_status(db, msg)
    return data


def member_user_ids(db: Session, conversation_id: int, active_only: bool = True) -> list[int]:
    q = select(ConversationMember.user_id).where(
        ConversationMember.conversation_id == conversation_id
    )
    if active_only:
        q = q.where(ConversationMember.is_active.is_(True))
    return list(db.scalars(q).all())


def unread_count(db: Session, membership: ConversationMember) -> int:
    last_read = membership.last_read_message_id or 0
    return (
        db.query(Message)
        .filter(
            Message.conversation_id == membership.conversation_id,
            Message.id > last_read,
            Message.sender_id != membership.user_id,
        )
        .count()
    )


def serialize_conversation(
    db: Session, conv: Conversation, user_id: int
) -> dict:
    members = [m for m in conv.members]
    member_payload = [
        {
            "user_id": m.user_id,
            "role": m.role.value,
            "is_active": m.is_active,
            "user": serialize_user(m.user),
        }
        for m in members
    ]

    last_msg = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .first()
    )

    my_membership = next((m for m in members if m.user_id == user_id), None)

    other_user = None
    if conv.type == ConversationType.DIRECT:
        other = next((m.user for m in members if m.user_id != user_id), None)
        if other:
            other_user = serialize_user(other)

    return {
        "id": conv.id,
        "type": conv.type.value,
        "name": conv.name,
        "avatar_color": conv.avatar_color,
        "avatar_url": conv.avatar_url,
        "created_by": conv.created_by,
        "last_activity": conv.last_activity.isoformat(),
        "members": member_payload,
        "last_message": serialize_message(db, last_msg, for_user_id=user_id)
        if last_msg
        else None,
        "unread_count": unread_count(db, my_membership) if my_membership else 0,
        "other_user": other_user,
    }
