import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pymongo.errors import ConfigurationError, OperationFailure, ServerSelectionTimeoutError

from . import config
from .db import ensure_indexes, get_database
from .routes_admin import router as admin_router
from .routes_auth import router as auth_router
from .routes_public import router as public_router
from .seed import seed

log = logging.getLogger("startup")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        db = get_database()
        ensure_indexes(db)
        seed(db)
    except Exception:  # keep the server up so /api/health/db can explain what is wrong
        log.exception("Startup setup failed; continuing")
    yield


app = FastAPI(title="Subh Sheva Sansthan", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


app.include_router(public_router)
app.include_router(auth_router)
app.include_router(admin_router)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/health/db")
def health_db():
    """Setup check: can the server reach MongoDB Atlas?"""
    try:
        get_database().command("ping")
    except Exception as exc:
        log.exception("Database ping failed")
        raise HTTPException(503, {"error": "database_unreachable", "reason": _explain(exc)})
    return {"ok": True, "database": "connected"}


def _explain(exc: Exception) -> str:
    """Plain-language reason for a failed database connection (never includes secrets)."""
    if isinstance(exc, RuntimeError):
        return "MONGODB_URI is not set in the environment variables"
    if isinstance(exc, OperationFailure):
        return "Atlas rejected the username or password (check MONGODB_URI and the Atlas database user)"
    if isinstance(exc, ServerSelectionTimeoutError):
        return "Could not reach Atlas (check Atlas Network Access allows 0.0.0.0/0, and the cluster is running)"
    if isinstance(exc, ConfigurationError):
        return "The connection string is not valid (check MONGODB_URI for typos, < > signs or spaces)"
    return f"Unexpected error: {type(exc).__name__}"


# Serve the built React app when it exists (production: one server does everything).
DIST = (Path(__file__).resolve().parent.parent.parent / "frontend" / "dist").resolve()
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = (DIST / full_path).resolve()
        if full_path and candidate.is_file() and DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")






