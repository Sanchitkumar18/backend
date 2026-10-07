"""Mocked auth / onboarding endpoints."""
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user
from ..config import settings
from ..database import get_db
from ..models import User, utcnow
from ..schemas import AuthResponse, RequestOTP, UserOut, VerifyOTP

router = APIRouter(prefix="/auth", tags=["auth"])

# Signal-style avatar colors assigned to new users.
AVATAR_COLORS = [
    "#3a76f0", "#6b7280", "#d4683b", "#5b9a3f", "#9c6ade",
    "#c74f82", "#2f9e9e", "#b8902f", "#4f6bed", "#d1495b",
]


def _find_user(db: Session, phone: str | None, username: str | None) -> User | None:
    if phone:
        return db.scalar(select(User).where(User.phone == phone))
    if username:
        return db.scalar(select(User).where(User.username == username))
    return None


@router.post("/request-otp")
def request_otp(payload: RequestOTP, db: Session = Depends(get_db)):
    if not payload.phone and not payload.username:
        raise HTTPException(400, "Provide a phone number or username")
    existing = _find_user(db, payload.phone, payload.username)
    # In a real app we'd send an SMS. Here the OTP is fixed; we return it so the
    # demo is self-serve. (Never do this in production.)
    return {
        "message": "OTP sent",
        "is_new_user": existing is None,
        "dev_otp": settings.mock_otp,
    }


@router.post("/verify", response_model=AuthResponse)
def verify_otp(payload: VerifyOTP, db: Session = Depends(get_db)):
    if payload.otp != settings.mock_otp:
        raise HTTPException(400, "Invalid OTP")
    if not payload.phone and not payload.username:
        raise HTTPException(400, "Provide a phone number or username")

    user = _find_user(db, payload.phone, payload.username)
    is_new = user is None

    if is_new:
        if not payload.display_name:
            raise HTTPException(400, "Display name is required for registration")
        user = User(
            phone=payload.phone,
            username=payload.username,
            display_name=payload.display_name,
            avatar_color=payload.avatar_color or random.choice(AVATAR_COLORS),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    user.is_online = True
    user.last_seen = utcnow()
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return AuthResponse(token=token, user=UserOut.model_validate(user), is_new_user=is_new)


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current


@router.post("/logout")
def logout(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current.is_online = False
    current.last_seen = utcnow()
    db.commit()
    return {"message": "Logged out"}
