# Signal Clone — Secure Messaging Platform

A functional clone of the [Signal](https://signal.org) messenger that recreates
Signal's design, UX and core messaging workflows: registration/onboarding,
contacts, one-on-one and group conversations, and **real-time** messaging with
typing indicators, presence and delivery/read receipts.

> Encryption is **mocked/simulated** (as allowed by the brief). The focus is on
> faithfully recreating the Signal experience and the messaging workflows, not
> on a real end-to-end cryptographic protocol.

---

## ✨ Features

### Core (all implemented)
- **Authentication / onboarding** — register/login with a phone number *or*
  username, verification via a **mocked fixed OTP (`123456`)**, display name +
  avatar colour, JWT session persistence, logout.
- **Conversation list** — sorted by most recent activity, search conversations &
  contacts, add a new contact (by phone/username), unread badges, last-message
  preview, online / last-seen indicators.
- **One-on-one messaging** — real-time send/receive over WebSockets, message
  timestamps, **delivery & read receipts** (the single ✓ / double ✓✓ / blue ✓✓
  experience), **typing indicators**, message status (`sending → sent →
  delivered → read`). All messages persisted.
- **Group messaging** — create a group (name + members), group messages, member
  list, **admin controls** (add/remove members, rename), system messages
  (“X created the group”, “Y was added/removed/left”). All persisted.
- **Signal experience** — conversation-list + chat-pane layout, Signal-style
  message bubbles & threading, modals, search, toasts/notifications, settings
  placeholders (privacy, notifications, appearance).

### Mocked / placeholder sections
Voice/Video calls, Stories, Linked devices, Chat wallpaper, and real E2E
encryption are present as **“Coming soon”** placeholders.

### Bonus (implemented)
- 🖼️ **Attachments** (image upload)
- 😀 **Message reactions** (emoji)
- 💬 **Reply / quoted messages**
- 🌙 **Dark mode**
- 📱 **Responsive design** (mobile / tablet / desktop)

---

## 🧱 Tech Stack

| Layer      | Technology                                                 |
|------------|------------------------------------------------------------|
| Frontend   | **Next.js 14** (App Router) + **TypeScript**, plain CSS (Signal-themed) |
| Backend    | **Python 3** + **FastAPI**                                 |
| ORM        | **SQLAlchemy 2.0**                                         |
| Database   | **SQLite**                                                 |
| Real-time  | **WebSockets** (native FastAPI/Starlette)                  |
| Auth       | Mocked OTP + **JWT** (PyJWT)                                |

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────┐          ┌─────────────────────────────────┐
│          Frontend            │          │             Backend             │
│        Next.js (TS)          │          │             FastAPI             │
│                              │          │                                 │
│  app/          routes        │  REST    │  routers/  auth, users,         │
│  components/   UI            │ ───────► │            conversations,       │
│  lib/store.tsx React store   │  (JSON)  │            messages             │
│     ├─ auth + session        │          │  models.py   SQLAlchemy schema  │
│     ├─ conversations/msgs    │          │  serializers enriched payloads  │
│     └─ WebSocket client  ────┼─ WS ───► │  realtime.py ConnectionManager  │
│  components/… Signal UI       │  events  │  events.py   broadcasters       │
└──────────────────────────────┘          │  main.py     app + /ws + upload │
                                           │        │                        │
                                           │        ▼                        │
                                           │     SQLite (signal_clone.db)    │
                                           └─────────────────────────────────┘
```

- **REST** handles all persistent reads/writes (auth, conversations, messages,
  contacts, profile, uploads).
- **A single WebSocket per user** (`/ws?token=…`) carries live events:
  `message:new`, `message:update`, `message:status`, `conversation:update`,
  `typing`, `presence`, `presence:init`.
- The backend `ConnectionManager` tracks `user_id → {sockets}` and fans events
  out to exactly the relevant participants.
- The frontend keeps all state in a single `useReducer` store (`lib/store.tsx`)
  that applies both REST responses and live socket events, with **optimistic**
  message sending reconciled by a `client_id`.

### Message status / receipts model
- A message is `sent` once persisted.
- On send, recipients that are **currently connected** get a `DELIVERED`
  receipt; offline recipients get one when they next connect.
- Opening a conversation marks messages `READ` (updates a per-member read
  cursor + `READ` receipts) and notifies the original senders.
- The sender’s aggregate status is `read` when **all** other active members have
  read, `delivered` when all have at least received, else `sent` — driving the
  ✓ / ✓✓ / blue ✓✓ UI.

---

## 🗄️ Database Schema

```
users
 ├─ id (PK)
 ├─ phone (unique, nullable)      username (unique, nullable)
 ├─ display_name   about   avatar_color   avatar_url
 ├─ is_online   last_seen   created_at

contacts                         (directional address-book edge)
 ├─ id (PK)
 ├─ owner_id  → users.id         contact_id → users.id
 ├─ nickname   created_at        UNIQUE(owner_id, contact_id)

conversations
 ├─ id (PK)
 ├─ type ('direct' | 'group')
 ├─ name  avatar_color  avatar_url        (group fields)
 ├─ created_by → users.id
 ├─ created_at   last_activity            (last_activity drives list sort)

conversation_members
 ├─ id (PK)
 ├─ conversation_id → conversations.id    user_id → users.id
 ├─ role ('admin' | 'member')   joined_at
 ├─ last_read_message_id        (read cursor → unread counts)
 ├─ muted   is_active           UNIQUE(conversation_id, user_id)

messages
 ├─ id (PK)
 ├─ conversation_id → conversations.id
 ├─ sender_id → users.id        (NULL for system messages)
 ├─ type ('text' | 'image' | 'system')    content
 ├─ attachment_url  attachment_name        (bonus: attachments)
 ├─ reply_to_id → messages.id              (bonus: replies)
 ├─ edited   deleted   created_at (indexed)

message_receipts                 (per-recipient delivery/read state)
 ├─ id (PK)
 ├─ message_id → messages.id     user_id → users.id
 ├─ status ('delivered' | 'read')   timestamp
 └─ UNIQUE(message_id, user_id)

reactions                        (bonus: emoji reactions)
 ├─ id (PK)
 ├─ message_id → messages.id     user_id → users.id
 ├─ emoji   created_at           UNIQUE(message_id, user_id)
```

**Relationships**
- `users` ↔ `conversations` many-to-many via `conversation_members`.
- `conversations` 1-to-many `messages`; `messages` 1-to-many `message_receipts`
  and `reactions`.
- `messages.reply_to_id` is a self-reference (quoted replies).
- `contacts` is a self-referential many-to-many on `users`.

---

## 🔌 API Overview

Base URL: `http://localhost:8000` · Interactive docs at **`/docs`** (Swagger).

### Auth
| Method | Path                | Description                                   |
|--------|---------------------|-----------------------------------------------|
| POST   | `/auth/request-otp` | Request OTP for a phone/username (returns the demo OTP) |
| POST   | `/auth/verify`      | Verify OTP → create/fetch user, returns JWT   |
| GET    | `/auth/me`          | Current user                                  |
| POST   | `/auth/logout`      | Mark offline                                  |

### Users & contacts
| Method | Path                    | Description                        |
|--------|-------------------------|------------------------------------|
| PATCH  | `/users/me`             | Update profile (name/about/colour) |
| GET    | `/users/search?q=`      | Search users                       |
| GET    | `/users`                | List all other users               |
| GET    | `/contacts`             | List saved contacts                |
| POST   | `/contacts`             | Add a contact by phone/username    |
| DELETE | `/contacts/{user_id}`   | Remove a contact                   |

### Conversations
| Method | Path                                         | Description                      |
|--------|----------------------------------------------|----------------------------------|
| GET    | `/conversations`                             | My conversations (recent first)  |
| POST   | `/conversations/direct`                      | Get/create a 1:1 conversation    |
| POST   | `/conversations/group`                       | Create a group                   |
| GET    | `/conversations/{id}`                        | Conversation detail              |
| PATCH  | `/conversations/{id}`                        | Rename / recolour group (admin)  |
| POST   | `/conversations/{id}/members`                | Add members (admin)              |
| DELETE | `/conversations/{id}/members/{user_id}`      | Remove member / leave            |
| GET    | `/conversations/{id}/messages?before=&limit=`| Message history (paginated)      |
| POST   | `/conversations/{id}/read`                   | Mark read (receipts + cursor)    |

### Messages
| Method | Path                               | Description                 |
|--------|------------------------------------|-----------------------------|
| POST   | `/conversations/{id}/messages`     | Send a message              |
| PATCH  | `/messages/{id}`                   | Edit own message            |
| DELETE | `/messages/{id}`                   | Delete own message (soft)   |
| POST   | `/messages/{id}/react`             | Add/replace/remove reaction |
| POST   | `/messages/{id}/delivered`         | Delivery acknowledgement    |
| POST   | `/upload`                          | Upload an image attachment  |

### WebSocket
`GET /ws?token=<JWT>` — bi-directional. Client sends `typing` / `ping`;
server pushes `message:new`, `message:update`, `message:status`,
`conversation:update`, `typing`, `presence`, `presence:init`.

---

## 🚀 Getting Started

### Prerequisites
- Python **3.11+**
- Node **18+**

### 1. Backend
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python -m app.seed          # create + seed the SQLite database
uvicorn app.main:app --reload --port 8000
```
Backend runs at `http://localhost:8000` (docs at `/docs`).

### 2. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local   # defaults point at localhost:8000
npm run dev
```
Frontend runs at `http://localhost:3000`.

---

## 👥 Demo Logins (seeded)

Any of these phone numbers with OTP **`123456`**:

| Phone          | Name          |
|----------------|---------------|
| `+15550000001` | Alice Johnson |
| `+15550000002` | Bob Martinez  |
| `+15550000003` | Carol Chen    |
| `+15550000004` | David Okafor  |
| `+15550000005` | Emma Wilson   |
| `+15550000006` | Frank Nguyen  |

Seed data includes direct chats, two groups (*Design Team*, *Weekend Trip*),
message history, reactions, unread threads and read receipts — so the app is
usable immediately. Open two browsers (or a normal + incognito window) logged in
as different users to see real-time messaging, typing and receipts live.

---

## 🧪 Trying real-time
1. Log in as **Alice** in one browser and **Carol** in another (incognito).
2. Open the Alice ↔ Carol chat on both sides.
3. Type in one window — the other shows the **typing…** indicator.
4. Send — it appears instantly; checkmarks go ✓ → ✓✓ → blue ✓✓ as it is
   delivered and read.

---

## 📁 Project Structure
```
scaler/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, /ws, /upload, presence
│   │   ├── config.py          # settings (env-overridable)
│   │   ├── database.py        # engine + session
│   │   ├── models.py          # SQLAlchemy schema
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── auth.py            # mocked OTP + JWT
│   │   ├── realtime.py        # WebSocket ConnectionManager
│   │   ├── events.py          # live-event broadcasters
│   │   ├── serializers.py     # enriched JSON payloads + status logic
│   │   ├── seed.py            # demo data
│   │   └── routers/           # auth, users, conversations, messages
│   └── requirements.txt
├── frontend/
│   ├── app/                   # layout, page, globals.css
│   ├── components/            # Sidebar, ChatView, MessageBubble, modals, …
│   └── lib/                   # api client, store, types, helpers
└── README.md
```

---

## 📝 Assumptions & Notes
- **Mocked OTP** is `123456` for every account and is returned by
  `/auth/request-otp` purely for demo convenience (never done in production).
- **Encryption is simulated** — the “end-to-end encrypted” label is UI only.
- Presence is driven by live WebSocket connections; `last_seen` is updated on
  disconnect.
- `check_same_thread=False` SQLite is used for simplicity; a production build
  would use Postgres + Alembic migrations instead of `create_all`.
- Attachments are stored on local disk under `backend/uploads/` and served at
  `/uploads/...`.

## 🌐 Deployment (notes)
- **Frontend** → Vercel/Netlify. Set `NEXT_PUBLIC_API_URL` and
  `NEXT_PUBLIC_WS_URL` to the deployed backend (`https://…` / `wss://…`).
- **Backend** → Render/Railway (`uvicorn app.main:app --host 0.0.0.0 --port
  $PORT`). Set `CORS_ORIGINS` to the frontend origin and a strong `JWT_SECRET`.
  For a persistent DB on a hosted platform, point `DATABASE_URL` at Postgres.
```
