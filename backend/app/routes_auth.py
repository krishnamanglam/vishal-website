from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database

from .db import get_db
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
def login(body: LoginIn, db: Database = Depends(get_db)):
    user = db.admin_users.find_one({"username": body.username})
    ok = verify_password(body.password, user["password_hash"] if user else DUMMY_HASH)
    if not (user and ok):
        raise HTTPException(401, "invalid_credentials")
    return {"token": create_token(user["username"]), "username": user["username"]}


@router.get("/me")
def me(user: dict = Depends(get_current_admin)):
    return {"username": user["username"]}


@router.post("/change-password")
def change_password(
    body: ChangePasswordIn,
    user: dict = Depends(get_current_admin),
    db: Database = Depends(get_db),
):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(400, "wrong_password")
    db.admin_users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}
