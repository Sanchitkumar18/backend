"""User profile, search and contacts."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Contact, User
from ..schemas import AddContact, UpdateProfile, UserOut

router = APIRouter(tags=["users"])


@router.patch("/users/me", response_model=UserOut)
def update_profile(
    payload: UpdateProfile,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current, field, value)
    db.commit()
    db.refresh(current)
    return current


@router.get("/users/search", response_model=list[UserOut])
def search_users(
    q: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    like = f"%{q}%"
    rows = db.scalars(
        select(User)
        .where(
            User.id != current.id,
            or_(
                User.display_name.ilike(like),
                User.username.ilike(like),
                User.phone.ilike(like),
            ),
        )
        .limit(25)
    ).all()
    return rows


@router.get("/users", response_model=list[UserOut])
def list_users(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All users except me — convenient for the 'new chat' / group pickers."""
    return db.scalars(select(User).where(User.id != current.id)).all()


# ---------------------------------------------------------------- Contacts
@router.get("/contacts", response_model=list[UserOut])
def list_contacts(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(User)
        .join(Contact, Contact.contact_id == User.id)
        .where(Contact.owner_id == current.id)
    ).all()
    return rows


@router.post("/contacts", response_model=UserOut)
def add_contact(
    payload: AddContact,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.phone:
        target = db.scalar(select(User).where(User.phone == payload.phone))
    elif payload.username:
        target = db.scalar(select(User).where(User.username == payload.username))
    else:
        raise HTTPException(400, "Provide a phone or username")

    if target is None:
        raise HTTPException(404, "No user found with those details")
    if target.id == current.id:
        raise HTTPException(400, "You cannot add yourself")

    exists = db.scalar(
        select(Contact).where(
            Contact.owner_id == current.id, Contact.contact_id == target.id
        )
    )
    if not exists:
        db.add(
            Contact(
                owner_id=current.id,
                contact_id=target.id,
                nickname=payload.nickname,
            )
        )
        db.commit()
    return target


@router.delete("/contacts/{user_id}")
def remove_contact(
    user_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = db.scalar(
        select(Contact).where(
            Contact.owner_id == current.id, Contact.contact_id == user_id
        )
    )
    if contact:
        db.delete(contact)
        db.commit()
    return {"message": "Contact removed"}
