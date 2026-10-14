import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATA_DIR


def _database_url() -> str:
    """DATABASE_URL (Postgres, e.g. Neon) in production, local SQLite file otherwise."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{DATA_DIR / 'app.db'}"
    # Hosts hand out postgres:// or postgresql://; SQLAlchemy needs the driver name too.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


if os.getenv("VERCEL") and not os.getenv("DATABASE_URL", "").strip():
    raise RuntimeError("Set DATABASE_URL to a Postgres address (for example a free Neon database).")

DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()
else:
    # Free Postgres hosts close idle connections, so test each one before use.
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=240, pool_size=5, max_overflow=5)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

