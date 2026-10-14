# Entrypoint for Vercel: it looks for a FastAPI instance called "app" in this file.
from app.main import app  # noqa: F401
