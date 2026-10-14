import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# MongoDB Atlas connection string, e.g. mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/
MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB = os.getenv("MONGODB_DB", "").strip() or "subh_sheva"

# Optional. If empty, a random signing key is created once and kept in the database,
# so it is the same on every server copy and survives restarts.
SECRET_KEY_ENV = os.getenv("SECRET_KEY", "").strip()
TOKEN_TTL_HOURS = 12

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", FRONTEND_URL).split(",") if o.strip()
]

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

# Set TRUST_PROXY=1 when a trusted host (e.g. Vercel) puts the visitor IP in X-Forwarded-For.
TRUST_PROXY = os.getenv("TRUST_PROXY", "") == "1"

UPI_ID = os.getenv("UPI_ID", "").strip()
PAYEE_NAME = os.getenv("PAYEE_NAME", "Subh Sheva Sansthan")

NOTIFY_PROVIDER = os.getenv("NOTIFY_PROVIDER", "none").lower()
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_SMS_FROM = os.getenv("TWILIO_SMS_FROM", "")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")

COMPANY_NAME_EN = "Subh Sheva Sansthan"
COMPANY_NAME_HI = "शुभ सेवा संस्थान"
