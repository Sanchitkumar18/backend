"""SQLAlchemy ORM models — the database schema.

Entity overview
---------------
User                one account (phone/username, display name, avatar, presence)
Contact             directional "saved contact" edge between two users
Conversation        a thread; either DIRECT (2 people) or GROUP (name + members)
ConversationMember  membership row (role, join time, read cursor, mute flag)
Message             a message in a conversation (text/image/system), supports reply
MessageReceipt      per-recipient delivery/read state (drives the check-mark UI)
Reaction            emoji reaction by a user on a message

The read-receipt / unread model keeps a `last_read_message_id` cursor on each
membership for fast unread counts, plus explicit MessageReceipt rows so the
sender can see the single/double-check "delivered vs read" experience.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ConversationType(str, enum.Enum):
    DIRECT = "direct"
    GROUP = "group"


class MemberRole(str, enum.Enum):
    ADMIN = "admin"
    MEMBER = "member"


class MessageType(str, enum.Enum):
    TEXT = "text"
    IMAGE = "image"
    SYSTEM = "system"  # "X created the group", "Y was added", etc.


class ReceiptStatus(str, enum.Enum):
    DELIVERED = "delivered"
    READ = "read"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Either a phone number or a username is used to sign in; both unique.
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    username: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    about: Mapped[str] = mapped_column(String(256), default="")
    # Avatar is a deterministic color (Signal-style initials) plus optional URL.
    avatar_color: Mapped[str] = mapped_column(String(16), default="#3a76f0")
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    memberships: Mapped[list[ConversationMember]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    messages: Mapped[list[Message]] = relationship(back_populates="sender")


class Contact(Base):
    """A saved contact: `owner` has saved `contact` in their address book."""

    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("owner_id", "contact_id", name="uq_contact"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # Optional nickname the owner assigned to the contact.
    nickname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    contact: Mapped[User] = relationship(foreign_keys=[contact_id])


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[ConversationType] = mapped_column(Enum(ConversationType))
    # Group-only fields:
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    avatar_color: Mapped[str] = mapped_column(String(16), default="#6b7280")
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Bumped whenever a message is sent so the chat list can sort by recency.
    last_activity: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    members: Mapped[list[ConversationMember]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_member"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[MemberRole] = mapped_column(Enum(MemberRole), default=MemberRole.MEMBER)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Read cursor: id of the last message this user has read in the conversation.
    last_read_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    muted: Mapped[bool] = mapped_column(Boolean, default=False)
    # Set when a member leaves/removed — keeps history but hides the thread.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id"), index=True
    )
    sender_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True  # null for SYSTEM messages
    )
    type: Mapped[MessageType] = mapped_column(Enum(MessageType), default=MessageType.TEXT)
    content: Mapped[str] = mapped_column(Text, default="")
    # Attachment (bonus): url + mime for image/file messages.
    attachment_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    attachment_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # Reply/quote (bonus): id of the message this one replies to.
    reply_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id"), nullable=True
    )
    edited: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    sender: Mapped[User | None] = relationship(back_populates="messages")
    reply_to: Mapped[Message | None] = relationship(remote_side=[id])
    receipts: Mapped[list[MessageReceipt]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )
    reactions: Mapped[list[Reaction]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )


class MessageReceipt(Base):
    """Per-recipient delivery/read state for a message."""

    __tablename__ = "message_receipts"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_receipt"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[ReceiptStatus] = mapped_column(Enum(ReceiptStatus))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    message: Mapped[Message] = relationship(back_populates="receipts")


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_reaction"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    message: Mapped[Message] = relationship(back_populates="reactions")
    user: Mapped[User] = relationship()
