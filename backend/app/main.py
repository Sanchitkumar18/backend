"""FastAPI application entry point.

Wires routers, CORS, static uploads and the real-time WebSocket endpoint.
Run with:  uvicorn app.main:app --reload
"""
from __future__ import annotations

import os
import uuid

from fastapi import (
    Depends,
    FastAPI,
    File,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .auth import decode_token, get_current_user
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .models import (
    ConversationMember,
    Message,
    MessageReceipt,
    ReceiptStatus,
    User,
    utcnow,
)
from .realtime import manager
from .routers import auth, conversations, messages, users

app = FastAPI(title="Signal Clone API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables on startup (demo convenience; a real app would use migrations).
Base.metadata.create_all(bind=engine)

# Static uploads for image/file attachments (bonus feature).
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(conversations.router)
app.include_router(messages.router)


@app.get("/")
def root():
    return {"name": "Signal Clone API", "status": "ok", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# --------------------------------------------------------------- uploads
@app.post("/upload")
def upload_file(
    file: UploadFile = File(...),
    current: User = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1]
    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.upload_dir, name)
    with open(path, "wb") as f:
        f.write(file.file.read())
    return {"url": f"/uploads/{name}", "name": file.filename}


# --------------------------------------------------------------- presence helpers
def _peer_user_ids(db, user_id: int) -> list[int]:
    """All distinct users who share an active conversation with `user_id`."""
    my_convs = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id
    )
    rows = db.scalars(
        select(ConversationMember.user_id)
        .where(
            ConversationMember.conversation_id.in_(my_convs),
            ConversationMember.user_id != user_id,
        )
        .distinct()
    ).all()
    return list(rows)


async def _broadcast_presence(db, user: User) -> None:
    payload = {
        "type": "presence",
        "data": {
            "user_id": user.id,
            "is_online": user.is_online,
            "last_seen": user.last_seen.isoformat() if user.last_seen else None,
        },
    }
    await manager.broadcast(_peer_user_ids(db, user.id), payload)


def _mark_all_delivered(db, user_id: int) -> list[int]:
    """When a user connects, mark undelivered messages addressed to them as
    delivered. Returns conversation ids whose senders should be notified."""
    my_convs = db.scalars(
        select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == user_id,
            ConversationMember.is_active.is_(True),
        )
    ).all()
    affected: set[int] = set()
    for cid in my_convs:
        pending = db.scalars(
            select(Message).where(
                Message.conversation_id == cid,
                Message.sender_id.is_not(None),
                Message.sender_id != user_id,
            )
        ).all()
        for m in pending:
            existing = db.scalar(
                select(MessageReceipt).where(
                    MessageReceipt.message_id == m.id,
                    MessageReceipt.user_id == user_id,
                )
            )
            if existing is None:
                db.add(
                    MessageReceipt(
                        message_id=m.id,
                        user_id=user_id,
                        status=ReceiptStatus.DELIVERED,
                    )
                )
                affected.add(cid)
    db.commit()
    return list(affected)


# --------------------------------------------------------------- WebSocket
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    try:
        user_id = decode_token(token)
    except Exception:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    user = db.get(User, user_id)
    if user is None:
        await websocket.close(code=4404)
        db.close()
        return

    await manager.connect(user_id, websocket)
    user.is_online = True
    user.last_seen = utcnow()
    db.commit()
    await _broadcast_presence(db, user)

    # Mark messages delivered + notify their senders.
    from .events import push_status_updates

    for cid in _mark_all_delivered(db, user_id):
        await push_status_updates(db, cid, actor_id=user_id)

    # Tell the newly connected client who is currently online.
    await websocket.send_json(
        {"type": "presence:init", "data": {"online_user_ids": manager.online_user_ids()}}
    )

    try:
        while True:
            data = await websocket.receive_json()
            event = data.get("type")

            if event == "typing":
                payload = data.get("data", {})
                conversation_id = payload.get("conversation_id")
                is_typing = payload.get("is_typing", False)
                if conversation_id is None:
                    continue
                member_ids = db.scalars(
                    select(ConversationMember.user_id).where(
                        ConversationMember.conversation_id == conversation_id,
                        ConversationMember.user_id != user_id,
                        ConversationMember.is_active.is_(True),
                    )
                ).all()
                await manager.broadcast(
                    list(member_ids),
                    {
                        "type": "typing",
                        "data": {
                            "conversation_id": conversation_id,
                            "user_id": user_id,
                            "display_name": user.display_name,
                            "is_typing": is_typing,
                        },
                    },
                )
            elif event == "ping":
                await websocket.send_json({"type": "pong", "data": {}})

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, websocket)
        # Only flip offline when the user has no other open sockets.
        if not manager.is_online(user_id):
            fresh = db.get(User, user_id)
            if fresh:
                fresh.is_online = False
                fresh.last_seen = utcnow()
                db.commit()
                await _broadcast_presence(db, fresh)
        db.close()
