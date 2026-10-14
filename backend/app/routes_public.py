import secrets
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from . import config
from .db import get_db
from .form_logic import clean_submission
from .models import utcnow
from .schemas import RequestCreate, TrackIn, normalize_phone
from .security import RateLimiter

router = APIRouter(prefix="/api")

submit_limiter = RateLimiter(limit=10, window_seconds=600)
lookup_limiter = RateLimiter(limit=20, window_seconds=300)

_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def iso(dt):
    return dt.isoformat() + "Z" if dt else None


def new_tracking_id() -> str:
    return "SSS-" + "".join(secrets.choice(_ID_ALPHABET) for _ in range(8))


def service_public(s: dict) -> dict:
    return {
        "id": str(s["_id"]),
        "slug": s["slug"],
        "name_en": s["name_en"],
        "name_hi": s["name_hi"],
        "desc_en": s.get("desc_en", ""),
        "desc_hi": s.get("desc_hi", ""),
        "icon": s.get("icon", "📄"),
        "fields": s.get("fields", []),
    }


def pay_url(token: str | None) -> str | None:
    return f"{config.FRONTEND_URL}/pay/{token}" if token else None


@router.get("/services")
def list_services(db: Database = Depends(get_db)):
    rows = db.services.find({"active": True}).sort([("sort_order", 1), ("_id", 1)])
    return [service_public(s) for s in rows]


@router.post("/requests", status_code=201, dependencies=[Depends(submit_limiter)])
def create_request(body: RequestCreate, db: Database = Depends(get_db)):
    service = db.services.find_one({"slug": body.service_slug, "active": True})
    if service is None:
        raise HTTPException(404, "service_not_found")

    data = clean_submission(service.get("fields", []), body.data)
    now = utcnow()
    doc = {
        "service_id": service["_id"],
        "service_slug": service["slug"],
        "name": body.name,
        "phone": body.phone,
        "data": data,
        "status": "new",
        "fee": None,
        "payment_status": "none",
        "paid_at": None,
        "admin_note": "",
        "created_at": now,
        "updated_at": now,
        "events": [{"kind": "created", "text": "Request submitted by customer", "actor": "customer", "created_at": now}],
    }
    for _ in range(5):
        doc["tracking_id"] = new_tracking_id()
        try:
            db.requests.insert_one(doc)
            break
        except DuplicateKeyError:
            continue
    else:
        raise HTTPException(500, "could_not_allocate_id")
    return {"tracking_id": doc["tracking_id"], "created_at": iso(now)}


@router.post("/track", dependencies=[Depends(lookup_limiter)])
def track(body: TrackIn, db: Database = Depends(get_db)):
    not_found = HTTPException(404, "not_found")
    try:
        phone = normalize_phone(body.phone)
    except ValueError:
        raise not_found
    req = db.requests.find_one({"tracking_id": body.tracking_id.strip().upper(), "phone": phone})
    if req is None:
        raise not_found
    service = db.services.find_one({"_id": req["service_id"]}) or {}
    return {
        "tracking_id": req["tracking_id"],
        "service_name_en": service.get("name_en", ""),
        "service_name_hi": service.get("name_hi", ""),
        "icon": service.get("icon", "📄"),
        "status": req["status"],
        "payment_status": req["payment_status"],
        "fee": req.get("fee") if req["payment_status"] != "none" else None,
        "pay_url": pay_url(req.get("pay_token")) if req["payment_status"] == "pending" else None,
        "created_at": iso(req["created_at"]),
        "updated_at": iso(req["updated_at"]),
    }


@router.get("/pay/{token}", dependencies=[Depends(lookup_limiter)])
def pay_info(token: str, db: Database = Depends(get_db)):
    req = db.requests.find_one({"pay_token": token})
    if req is None or req.get("fee") is None:
        raise HTTPException(404, "not_found")
    service = db.services.find_one({"_id": req["service_id"]}) or {}
    upi_link = None
    if config.UPI_ID and req["payment_status"] == "pending":
        upi_link = (
            f"upi://pay?pa={quote(config.UPI_ID)}&pn={quote(config.PAYEE_NAME)}"
            f"&am={req['fee']}.00&cu=INR&tn={quote(req['tracking_id'])}"
        )
    return {
        "tracking_id": req["tracking_id"],
        "service_name_en": service.get("name_en", ""),
        "service_name_hi": service.get("name_hi", ""),
        "customer_name": req["name"],
        "fee": req["fee"],
        "payment_status": req["payment_status"],
        "upi_id": config.UPI_ID or None,
        "payee_name": config.PAYEE_NAME,
        "upi_link": upi_link,
    }
