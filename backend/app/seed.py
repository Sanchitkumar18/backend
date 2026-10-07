"""Seed the database with demo users, conversations and messages.

Run:  python -m app.seed     (from the backend/ directory)

Every account signs in with the fixed OTP 123456. Pick any phone number below
on the login screen to explore the app from that user's perspective.
"""
from __future__ import annotations

from datetime import timedelta

from .database import Base, SessionLocal, engine
from .models import (
    Contact,
    Conversation,
    ConversationMember,
    ConversationType,
    MemberRole,
    Message,
    MessageReceipt,
    MessageType,
    Reaction,
    ReceiptStatus,
    User,
    utcnow,
)

USERS = [
    # phone, display_name, color, about
    ("+15550000001", "Alice Johnson", "#3a76f0", "At the speed of thought"),
    ("+15550000002", "Bob Martinez", "#d4683b", "Available"),
    ("+15550000003", "Carol Chen", "#5b9a3f", "Working from home"),
    ("+15550000004", "David Okafor", "#9c6ade", "Be kind 🌱"),
    ("+15550000005", "Emma Wilson", "#c74f82", "Coffee first ☕"),
    ("+15550000006", "Frank Nguyen", "#2f9e9e", "Signal is great"),
]


def reset_db() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def seed() -> None:
    reset_db()
    db = SessionLocal()
    now = utcnow()

    # ---- users
    users: dict[str, User] = {}
    for i, (phone, name, color, about) in enumerate(USERS):
        u = User(
            phone=phone,
            username=name.split()[0].lower(),
            display_name=name,
            avatar_color=color,
            about=about,
            last_seen=now - timedelta(minutes=i * 7),
        )
        db.add(u)
        users[name] = u
    db.commit()
    for u in users.values():
        db.refresh(u)

    alice = users["Alice Johnson"]
    bob = users["Bob Martinez"]
    carol = users["Carol Chen"]
    david = users["David Okafor"]
    emma = users["Emma Wilson"]
    frank = users["Frank Nguyen"]

    # ---- everyone is a contact of Alice (and vice-versa) for a full demo
    for other in users.values():
        if other.id == alice.id:
            continue
        db.add(Contact(owner_id=alice.id, contact_id=other.id))
        db.add(Contact(owner_id=other.id, contact_id=alice.id))
    db.commit()

    def direct(a: User, b: User) -> Conversation:
        c = Conversation(type=ConversationType.DIRECT, last_activity=now)
        db.add(c)
        db.flush()
        db.add_all(
            [
                ConversationMember(conversation_id=c.id, user_id=a.id),
                ConversationMember(conversation_id=c.id, user_id=b.id),
            ]
        )
        return c

    def add_msg(
        conv: Conversation,
        sender: User | None,
        text: str,
        minutes_ago: float,
        mtype: MessageType = MessageType.TEXT,
    ) -> Message:
        m = Message(
            conversation_id=conv.id,
            sender_id=sender.id if sender else None,
            type=mtype,
            content=text,
            created_at=now - timedelta(minutes=minutes_ago),
        )
        db.add(m)
        db.flush()
        conv.last_activity = m.created_at
        return m

    def read_by(msg: Message, user: User) -> None:
        db.add(
            MessageReceipt(
                message_id=msg.id, user_id=user.id, status=ReceiptStatus.READ
            )
        )

    def set_cursor(conv: Conversation, user: User, msg: Message) -> None:
        m = db.query(ConversationMember).filter_by(
            conversation_id=conv.id, user_id=user.id
        ).first()
        if m:
            m.last_read_message_id = msg.id

    # ---- Alice <-> Bob (active, read)
    c_ab = direct(alice, bob)
    m1 = add_msg(c_ab, bob, "Hey Alice! Are we still on for lunch tomorrow?", 240)
    read_by(m1, alice)
    m2 = add_msg(c_ab, alice, "Yes! 12:30 at the usual place?", 238)
    read_by(m2, bob)
    m3 = add_msg(c_ab, bob, "Perfect, see you then 🙌", 236)
    read_by(m3, alice)
    db.add(Reaction(message_id=m3.id, user_id=alice.id, emoji="❤️"))
    set_cursor(c_ab, alice, m3)
    set_cursor(c_ab, bob, m2)

    # ---- Alice <-> Carol (unread for Alice)
    c_ac = direct(alice, carol)
    n1 = add_msg(c_ac, alice, "Did you get a chance to review the PR?", 120)
    read_by(n1, carol)
    n2 = add_msg(c_ac, carol, "Looking at it now, a couple of comments incoming", 30)
    n3 = add_msg(c_ac, carol, "Left them! Mostly minor, great work overall 👏", 12)
    # Alice hasn't read n2/n3 yet -> unread badge.
    set_cursor(c_ac, alice, n1)
    set_cursor(c_ac, carol, n1)

    # ---- Alice <-> David
    c_ad = direct(alice, david)
    d1 = add_msg(c_ad, david, "Thanks for the help earlier!", 1440)
    read_by(d1, alice)
    d2 = add_msg(c_ad, alice, "Anytime 🙂", 1438)
    read_by(d2, david)
    set_cursor(c_ad, alice, d2)
    set_cursor(c_ad, david, d2)

    # ---- Bob <-> Carol (so non-Alice logins have content too)
    c_bc = direct(bob, carol)
    b1 = add_msg(c_bc, carol, "Standup moved to 10am", 300)
    read_by(b1, bob)
    b2 = add_msg(c_bc, bob, "Got it, thanks", 299)
    set_cursor(c_bc, bob, b1)

    # ---- Group: "Design Team"
    group = Conversation(
        type=ConversationType.GROUP,
        name="Design Team",
        avatar_color="#9c6ade",
        created_by=alice.id,
        last_activity=now,
    )
    db.add(group)
    db.flush()
    db.add_all(
        [
            ConversationMember(
                conversation_id=group.id, user_id=alice.id, role=MemberRole.ADMIN
            ),
            ConversationMember(conversation_id=group.id, user_id=bob.id),
            ConversationMember(conversation_id=group.id, user_id=emma.id),
            ConversationMember(conversation_id=group.id, user_id=frank.id),
        ]
    )
    add_msg(group, None, "Alice Johnson created the group", 200, MessageType.SYSTEM)
    g1 = add_msg(group, alice, "Welcome everyone to the Design Team group! 🎨", 180)
    read_by(g1, bob); read_by(g1, emma); read_by(g1, frank)
    g2 = add_msg(group, emma, "Excited to be here!", 170)
    read_by(g2, alice); read_by(g2, bob)
    g3 = add_msg(group, frank, "Where should we drop the mockups?", 160)
    read_by(g3, alice)
    g4 = add_msg(group, alice, "I'll set up a shared folder and post the link here", 150)
    read_by(g4, emma)
    db.add(Reaction(message_id=g4.id, user_id=frank.id, emoji="👍"))
    set_cursor(group, alice, g4)

    # ---- Group: "Weekend Trip"
    trip = Conversation(
        type=ConversationType.GROUP,
        name="Weekend Trip",
        avatar_color="#d4683b",
        created_by=bob.id,
        last_activity=now,
    )
    db.add(trip)
    db.flush()
    db.add_all(
        [
            ConversationMember(
                conversation_id=trip.id, user_id=bob.id, role=MemberRole.ADMIN
            ),
            ConversationMember(conversation_id=trip.id, user_id=alice.id),
            ConversationMember(conversation_id=trip.id, user_id=carol.id),
            ConversationMember(conversation_id=trip.id, user_id=david.id),
        ]
    )
    add_msg(trip, None, "Bob Martinez created the group", 90, MessageType.SYSTEM)
    t1 = add_msg(trip, bob, "Who's in for the cabin this weekend?", 80)
    read_by(t1, alice); read_by(t1, carol)
    t2 = add_msg(trip, carol, "Count me in! 🏕️", 70)
    read_by(t2, alice)
    t3 = add_msg(trip, david, "Same here, I can drive", 60)
    # Alice hasn't read the latest trip messages -> unread badge.
    set_cursor(trip, alice, t1)

    db.commit()
    db.close()
    print("Seeded database successfully.")
    print("Log in with any of these phone numbers and OTP 123456:")
    for phone, name, *_ in USERS:
        print(f"  {phone}  ({name})")


if __name__ == "__main__":
    seed()
