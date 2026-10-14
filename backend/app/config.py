import os
import secrets
import tempfile
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL_SET = bool(os.getenv("DATABASE_URL", "").strip())

DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    # Read-only filesystem (serverless hosts): fall back to the temp folder.
    DATA_DIR = Path(tempfile.gettempdir()) / "ssn-data"
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_secret() -> str:
    """Use SECRET_KEY from env, otherwise create and persist a random one."""
    from_env = os.getenv("SECRET_KEY")
    if from_env:
        return from_env
    if DATABASE_URL_SET:
        # Hosted setups can run several copies or restart often, and a key stored in a
        # local file would differ between them and log the admin out at random.
        raise RuntimeError("Set the SECRET_KEY environment variable (any long random text).")
    key_file = DATA_DIR / "secret.key"
    if not key_file.exists():
        key_file.write_text(secrets.token_urlsafe(48))
    return key_file.read_text().strip()


SECRET_KEY = _load_secret()
TOKEN_TTL_HOURS = 12

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", FRONTEND_URL).split(",") if o.strip()
]

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")

# Set TRUST_PROXY=1 when a trusted host (e.g. Vercel) puts the visitor IP in X-Forwarded-For.
TRUST_PROXY = os.getenv("TRUST_PROXY", "") == "1"
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

UPI_ID = os.getenv("UPI_ID", "").strip()
PAYEE_NAME = os.getenv("PAYEE_NAME", "Subh Sheva Sansthan")

NOTIFY_PROVIDER = os.getenv("NOTIFY_PROVIDER", "none").lower()
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_SMS_FROM = os.getenv("TWILIO_SMS_FROM", "")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")

COMPANY_NAME_EN = "Subh Sheva Sansthan"
COMPANY_NAME_HI = "शुभ सेवा संस्थान"


