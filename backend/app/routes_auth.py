from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models import AdminUser
from .schemas import ChangePasswordIn, LoginIn
from .security import (
    DUMMY_HASH,
    RateLimiter,
    create_token,
    get_current_admin,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth")

login_limiter = RateLimiter(limit=8, window_seconds=300)


@router.post("/login", dependencies=[Depends(login_limiter)])
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(AdminUser).filter(AdminUser.username == body.username).first()
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not (user and ok):
        raise HTTPException(401, "invalid_credentials")
    return {"token": create_token(user.username), "username": user.username}


@router.get("/me")
def me(user: AdminUser = Depends(get_current_admin)):
    return {"username": user.username}


@router.post("/change-password")
def change_password(
    body: ChangePasswordIn,
    user: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "wrong_password")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}
