"""Conversation lifecycle: list, create direct/group, members, history, read."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..events import emit_conversation_update, emit_new_message, push_status_updates
from ..models import (
    Conversation,
    ConversationMember,
    ConversationType,
    MemberRole,
    Message,
    MessageReceipt,
    MessageType,
    ReceiptStatus,
    User,
    utcnow,
)
from ..schemas import (
    ConversationOut,
    CreateDirect,
    CreateGroup,
    GroupMembers,
    MessageOut,
    UpdateGroup,
)
from ..serializers import serialize_conversation, serialize_message

router = APIRouter(prefix="/conversations", tags=["conversations"])


# ------------------------------------------------------------- helpers
def get_membership(db: Session, conversation_id: int, user_id: int) -> ConversationMember:
    m = db.scalar(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    if m is None or not m.is_active:
        raise HTTPException(403, "You are not a member of this conversation")
    return m


def _system_message(db: Session, conversation_id: int, text: str) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        sender_id=None,
        type=MessageType.SYSTEM,
        content=text,
    )
    db.add(msg)
    return msg


# ------------------------------------------------------------- list
@router.get("", response_model=list[ConversationOut])
def list_conversations(
    current: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    convs = db.scalars(
        select(Conversation)
        .join(ConversationMember)
        .where(
            ConversationMember.user_id == current.id,
            ConversationMember.is_active.is_(True),
        )
        .order_by(Conversation.last_activity.desc())
    ).all()
    return [serialize_conversation(db, c, current.id) for c in convs]


# ------------------------------------------------------------- create direct
@router.post("/direct", response_model=ConversationOut)
def create_direct(
    payload: CreateDirect,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    other = db.get(User, payload.user_id)
    if other is None:
        raise HTTPException(404, "User not found")
    if other.id == current.id:
        raise HTTPException(400, "Cannot start a chat with yourself")

    # Reuse an existing 1:1 conversation between these two users if present.
    my_convs = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == current.id
    )
    existing = db.scalar(
        select(Conversation)
        .join(ConversationMember)
        .where(
            Conversation.type == ConversationType.DIRECT,
            Conversation.id.in_(my_convs),
            ConversationMember.user_id == other.id,
        )
    )
    if existing:
        return serialize_conversation(db, existing, current.id)

    conv = Conversation(type=ConversationType.DIRECT)
    db.add(conv)
    db.flush()
    db.add_all(
        [
            ConversationMember(conversation_id=conv.id, user_id=current.id),
            ConversationMember(conversation_id=conv.id, user_id=other.id),
        ]
    )
    db.commit()
    db.refresh(conv)
    return serialize_conversation(db, conv, current.id)


# ------------------------------------------------------------- create group
@router.post("/group", response_model=ConversationOut)
async def create_group(
    payload: CreateGroup,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not payload.name.strip():
        raise HTTPException(400, "Group name is required")

    member_ids = set(payload.member_ids) | {current.id}
    conv = Conversation(
        type=ConversationType.GROUP,
        name=payload.name.strip(),
        avatar_color=payload.avatar_color or "#6b7280",
        created_by=current.id,
    )
    db.add(conv)
    db.flush()
    for uid in member_ids:
        db.add(
            ConversationMember(
                conversation_id=conv.id,
                user_id=uid,
                role=MemberRole.ADMIN if uid == current.id else MemberRole.MEMBER,
            )
        )
    _system_message(db, conv.id, f"{current.display_name} created the group")
    db.commit()
    db.refresh(conv)
    await emit_conversation_update(db, conv.id)
    return serialize_conversation(db, conv, current.id)


# ------------------------------------------------------------- detail
@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_membership(db, conversation_id, current.id)
    conv = db.get(Conversation, conversation_id)
    return serialize_conversation(db, conv, current.id)


# ------------------------------------------------------------- update group
@router.patch("/{conversation_id}", response_model=ConversationOut)
async def update_group(
    conversation_id: int,
    payload: UpdateGroup,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = get_membership(db, conversation_id, current.id)
    conv = db.get(Conversation, conversation_id)
    if conv.type != ConversationType.GROUP:
        raise HTTPException(400, "Not a group conversation")
    if membership.role != MemberRole.ADMIN:
        raise HTTPException(403, "Only admins can edit the group")

    if payload.name is not None:
        conv.name = payload.name.strip()
    if payload.avatar_color is not None:
        conv.avatar_color = payload.avatar_color
    _system_message(db, conv.id, f"{current.display_name} updated the group")
    db.commit()
    await emit_conversation_update(db, conv.id)
    return serialize_conversation(db, conv, current.id)


# ------------------------------------------------------------- add members
@router.post("/{conversation_id}/members", response_model=ConversationOut)
async def add_members(
    conversation_id: int,
    payload: GroupMembers,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = get_membership(db, conversation_id, current.id)
    conv = db.get(Conversation, conversation_id)
    if conv.type != ConversationType.GROUP:
        raise HTTPException(400, "Not a group conversation")
    if membership.role != MemberRole.ADMIN:
        raise HTTPException(403, "Only admins can add members")

    for uid in payload.member_ids:
        existing = db.scalar(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == uid,
            )
        )
        user = db.get(User, uid)
        if user is None:
            continue
        if existing:
            existing.is_active = True
        else:
            db.add(ConversationMember(conversation_id=conversation_id, user_id=uid))
        _system_message(db, conv.id, f"{user.display_name} was added")
    db.commit()
    await emit_conversation_update(db, conv.id)
    return serialize_conversation(db, conv, current.id)


# ------------------------------------------------------------- remove / leave
@router.delete("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
async def remove_member(
    conversation_id: int,
    user_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = get_membership(db, conversation_id, current.id)
    conv = db.get(Conversation, conversation_id)
    if conv.type != ConversationType.GROUP:
        raise HTTPException(400, "Not a group conversation")
    # Members may remove themselves (leave); only admins may remove others.
    if user_id != current.id and membership.role != MemberRole.ADMIN:
        raise HTTPException(403, "Only admins can remove members")

    target = db.scalar(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    if target and target.is_active:
        target.is_active = False
        user = db.get(User, user_id)
        verb = "left" if user_id == current.id else "was removed"
        _system_message(db, conv.id, f"{user.display_name} {verb}")
        db.commit()
        await emit_conversation_update(db, conv.id)
    conv = db.get(Conversation, conversation_id)
    return serialize_conversation(db, conv, current.id)


# ------------------------------------------------------------- history
@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(
    conversation_id: int,
    before: int | None = Query(None, description="Return messages with id < before"),
    limit: int = Query(50, le=100),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_membership(db, conversation_id, current.id)
    q = select(Message).where(Message.conversation_id == conversation_id)
    if before:
        q = q.where(Message.id < before)
    rows = db.scalars(q.order_by(Message.id.desc()).limit(limit)).all()
    rows = list(reversed(rows))  # chronological order for the UI
    return [serialize_message(db, m, for_user_id=current.id) for m in rows]


# ------------------------------------------------------------- mark read
@router.post("/{conversation_id}/read")
async def mark_read(
    conversation_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = get_membership(db, conversation_id, current.id)

    latest = db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.id.desc())
    )
    if latest is None:
        return {"message": "Nothing to read"}

    membership.last_read_message_id = latest.id

    # Upsert READ receipts for every message from others up to the latest.
    others = db.scalars(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.sender_id.is_not(None),
            Message.sender_id != current.id,
            Message.id <= latest.id,
        )
    ).all()
    for m in others:
        receipt = db.scalar(
            select(MessageReceipt).where(
                MessageReceipt.message_id == m.id,
                MessageReceipt.user_id == current.id,
            )
        )
        if receipt is None:
            db.add(
                MessageReceipt(
                    message_id=m.id,
                    user_id=current.id,
                    status=ReceiptStatus.READ,
                )
            )
        elif receipt.status != ReceiptStatus.READ:
            receipt.status = ReceiptStatus.READ
            receipt.timestamp = utcnow()
    db.commit()
    await push_status_updates(db, conversation_id, current.id)
    return {"message": "Marked read", "last_read_message_id": latest.id}
