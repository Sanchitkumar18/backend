"""Message actions: send, edit, delete, react, delivery acknowledgements."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..events import emit_message_update, emit_new_message, push_status_updates
from ..models import (
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    MessageType,
    Reaction,
    ReceiptStatus,
    User,
    utcnow,
)
from ..realtime import manager
from ..schemas import EditMessage, MessageOut, ReactMessage, SendMessage
from ..serializers import serialize_message
from .conversations import get_membership

router = APIRouter(tags=["messages"])


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut)
async def send_message(
    conversation_id: int,
    payload: SendMessage,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_membership(db, conversation_id, current.id)
    if not payload.content.strip() and not payload.attachment_url:
        raise HTTPException(400, "Message is empty")

    conv = db.get(Conversation, conversation_id)
    msg = Message(
        conversation_id=conversation_id,
        sender_id=current.id,
        type=payload.type,
        content=payload.content,
        reply_to_id=payload.reply_to_id,
        attachment_url=payload.attachment_url,
        attachment_name=payload.attachment_name,
    )
    db.add(msg)
    conv.last_activity = utcnow()
    db.flush()

    # Immediately mark DELIVERED for recipients that are currently connected.
    recipients = db.scalars(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id != current.id,
            ConversationMember.is_active.is_(True),
        )
    ).all()
    for uid in recipients:
        if manager.is_online(uid):
            db.add(
                MessageReceipt(
                    message_id=msg.id, user_id=uid, status=ReceiptStatus.DELIVERED
                )
            )
    db.commit()
    db.refresh(msg)

    # emit_new_message already carries the delivered status computed above.
    await emit_new_message(db, msg)

    result = serialize_message(db, msg, for_user_id=current.id)
    # Echo the client_id back so the sender can reconcile the optimistic bubble.
    result["client_id"] = payload.client_id
    return result


@router.patch("/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    message_id: int,
    payload: EditMessage,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = db.get(Message, message_id)
    if msg is None:
        raise HTTPException(404, "Message not found")
    if msg.sender_id != current.id:
        raise HTTPException(403, "You can only edit your own messages")
    msg.content = payload.content
    msg.edited = True
    db.commit()
    db.refresh(msg)
    await emit_message_update(db, msg)
    return serialize_message(db, msg, for_user_id=current.id)


@router.delete("/messages/{message_id}", response_model=MessageOut)
async def delete_message(
    message_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = db.get(Message, message_id)
    if msg is None:
        raise HTTPException(404, "Message not found")
    if msg.sender_id != current.id:
        raise HTTPException(403, "You can only delete your own messages")
    msg.deleted = True
    msg.content = ""
    db.commit()
    db.refresh(msg)
    await emit_message_update(db, msg)
    return serialize_message(db, msg, for_user_id=current.id)


@router.post("/messages/{message_id}/react", response_model=MessageOut)
async def react_message(
    message_id: int,
    payload: ReactMessage,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = db.get(Message, message_id)
    if msg is None:
        raise HTTPException(404, "Message not found")
    get_membership(db, msg.conversation_id, current.id)

    existing = db.scalar(
        select(Reaction).where(
            Reaction.message_id == message_id, Reaction.user_id == current.id
        )
    )
    if not payload.emoji:
        # Remove reaction.
        if existing:
            db.delete(existing)
    elif existing:
        existing.emoji = payload.emoji  # replace (Signal: one reaction per user)
    else:
        db.add(Reaction(message_id=message_id, user_id=current.id, emoji=payload.emoji))
    db.commit()
    db.refresh(msg)
    await emit_message_update(db, msg)
    return serialize_message(db, msg, for_user_id=current.id)


@router.post("/messages/{message_id}/delivered")
async def mark_delivered(
    message_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Client acknowledges it received a message (delivered receipt)."""
    msg = db.get(Message, message_id)
    if msg is None:
        raise HTTPException(404, "Message not found")
    if msg.sender_id == current.id:
        return {"message": "ok"}
    existing = db.scalar(
        select(MessageReceipt).where(
            MessageReceipt.message_id == message_id,
            MessageReceipt.user_id == current.id,
        )
    )
    if existing is None:
        db.add(
            MessageReceipt(
                message_id=message_id,
                user_id=current.id,
                status=ReceiptStatus.DELIVERED,
            )
        )
        db.commit()
        if msg.sender_id is not None:
            await push_status_updates(db, msg.conversation_id, actor_id=current.id)
    return {"message": "ok"}
