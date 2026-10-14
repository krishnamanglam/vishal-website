import hashlib
import hmac
import os
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from time import monotonic

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.database import Database

from . import config
from .db import get_db, get_secret_key

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


# Used to keep login timing similar when the username does not exist.
DUMMY_HASH = hash_password("not-a-real-password")


def create_token(username: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=config.TOKEN_TTL_HOURS)
    return jwt.encode({"sub": username, "exp": exp}, get_secret_key(), algorithm="HS256")


def get_current_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Database = Depends(get_db),
) -> dict:
    if creds is None:
        raise HTTPException(401, "not_authenticated")
    try:
        payload = jwt.decode(creds.credentials, get_secret_key(), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid_token")
    sub = payload.get("sub")
    user = db.admin_users.find_one({"username": sub}) if isinstance(sub, str) else None
    if user is None:
        raise HTTPException(401, "invalid_token")
    return user


class RateLimiter:
    """Small in-memory per-IP limiter. Fine for a single-process deployment."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self.hits: dict[str, deque] = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        if config.TRUST_PROXY:
            forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            ip = forwarded or ip
        now = monotonic()
        q = self.hits[ip]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise HTTPException(429, "too_many_requests")
        q.append(now)






