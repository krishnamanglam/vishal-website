import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .db import Base, SessionLocal, engine
from .routes_admin import router as admin_router
from .routes_auth import router as auth_router
from .routes_public import router as public_router
from .seed import seed

log = logging.getLogger("startup")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        Base.metadata.create_all(engine)
        with SessionLocal() as db:
            seed(db)
    except Exception:  # another instance may be setting up at the same moment
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



