"""Pydantic request/response schemas (API contract)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from .models import ConversationType, MemberRole, MessageType


# ---------------------------------------------------------------- Auth
class RequestOTP(BaseModel):
    # Provide exactly one of phone / username.
    phone: str | None = None
    username: str | None = None


class VerifyOTP(BaseModel):
    phone: str | None = None
    username: str | None = None
    otp: str
    # Supplied on first-time registration.
    display_name: str | None = None
    avatar_color: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: UserOut
    is_new_user: bool


# ---------------------------------------------------------------- Users
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    phone: str | None
    username: str | None
    display_name: str
    about: str
    avatar_color: str
    avatar_url: str | None
    is_online: bool
    last_seen: datetime


class UpdateProfile(BaseModel):
    display_name: str | None = None
    about: str | None = None
    avatar_color: str | None = None
    avatar_url: str | None = None


class AddContact(BaseModel):
    # Look up by phone or username.
    phone: str | None = None
    username: str | None = None
    nickname: str | None = None


# ---------------------------------------------------------------- Messages
class ReactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    emoji: str


class ReplyPreview(BaseModel):
    id: int
    sender_id: int | None
    sender_name: str | None
    content: str
    type: MessageType


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    conversation_id: int
    sender_id: int | None
    type: MessageType
    content: str
    attachment_url: str | None
    attachment_name: str | None
    reply_to_id: int | None
    edited: bool
    deleted: bool
    created_at: datetime
    # Enriched fields (not direct columns):
    reply_to: ReplyPreview | None = None
    reactions: list[ReactionOut] = []
    # Aggregate status for the sender's own messages: sent|delivered|read
    status: str | None = None


class SendMessage(BaseModel):
    content: str = ""
    type: MessageType = MessageType.TEXT
    reply_to_id: int | None = None
    attachment_url: str | None = None
    attachment_name: str | None = None
    # Client-generated id so the sender can reconcile the optimistic bubble.
    client_id: str | None = None


class EditMessage(BaseModel):
    content: str


class ReactMessage(BaseModel):
    emoji: str  # empty string removes the reaction


# ---------------------------------------------------------------- Conversations
class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    role: MemberRole
    is_active: bool
    user: UserOut


class ConversationOut(BaseModel):
    id: int
    type: ConversationType
    name: str | None
    avatar_color: str
    avatar_url: str | None
    created_by: int | None
    last_activity: datetime
    members: list[MemberOut]
    last_message: MessageOut | None = None
    unread_count: int = 0
    # For DIRECT chats, the other participant (convenience for the UI).
    other_user: UserOut | None = None


class CreateDirect(BaseModel):
    user_id: int


class CreateGroup(BaseModel):
    name: str
    member_ids: list[int]
    avatar_color: str | None = None


class UpdateGroup(BaseModel):
    name: str | None = None
    avatar_color: str | None = None


class GroupMembers(BaseModel):
    member_ids: list[int]
