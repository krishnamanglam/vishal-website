import secrets
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .form_logic import clean_submission
from .models import RequestEvent, Service, ServiceRequest
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


def service_public(s: Service) -> dict:
    return {
        "id": s.id,
        "slug": s.slug,
        "name_en": s.name_en,
        "name_hi": s.name_hi,
        "desc_en": s.desc_en,
        "desc_hi": s.desc_hi,
        "icon": s.icon,
        "fields": s.fields,
    }


def pay_url(token: str | None) -> str | None:
    return f"{config.FRONTEND_URL}/pay/{token}" if token else None


@router.get("/services")
def list_services(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Service).where(Service.active.is_(True)).order_by(Service.sort_order, Service.id)
    ).all()
    return [service_public(s) for s in rows]


@router.post("/requests", status_code=201, dependencies=[Depends(submit_limiter)])
def create_request(body: RequestCreate, db: Session = Depends(get_db)):
    service = db.scalar(
        select(Service).where(Service.slug == body.service_slug, Service.active.is_(True))
    )
    if service is None:
        raise HTTPException(404, "service_not_found")

    data = clean_submission(service.fields, body.data)

    for _ in range(5):
        tracking_id = new_tracking_id()
        if db.scalar(select(ServiceRequest.id).where(ServiceRequest.tracking_id == tracking_id)) is None:
            break
    else:
        raise HTTPException(500, "could_not_allocate_id")

    req = ServiceRequest(
        tracking_id=tracking_id,
        service_id=service.id,
        name=body.name,
        phone=body.phone,
        data=data,
    )
    req.events.append(RequestEvent(kind="created", text="Request submitted by customer", actor="customer"))
    db.add(req)
    db.commit()
    return {"tracking_id": req.tracking_id, "created_at": iso(req.created_at)}


@router.post("/track", dependencies=[Depends(lookup_limiter)])
def track(body: TrackIn, db: Session = Depends(get_db)):
    not_found = HTTPException(404, "not_found")
    try:
        phone = normalize_phone(body.phone)
    except ValueError:
        raise not_found
    req = db.scalar(
        select(ServiceRequest).where(
            ServiceRequest.tracking_id == body.tracking_id.strip().upper(),
            ServiceRequest.phone == phone,
        )
    )
    if req is None:
        raise not_found
    return {
        "tracking_id": req.tracking_id,
        "service_name_en": req.service.name_en,
        "service_name_hi": req.service.name_hi,
        "icon": req.service.icon,
        "status": req.status,
        "payment_status": req.payment_status,
        "fee": req.fee if req.payment_status != "none" else None,
        "pay_url": pay_url(req.pay_token) if req.payment_status == "pending" else None,
        "created_at": iso(req.created_at),
        "updated_at": iso(req.updated_at),
    }


@router.get("/pay/{token}", dependencies=[Depends(lookup_limiter)])
def pay_info(token: str, db: Session = Depends(get_db)):
    req = db.scalar(select(ServiceRequest).where(ServiceRequest.pay_token == token))
    if req is None or req.fee is None:
        raise HTTPException(404, "not_found")
    upi_link = None
    if config.UPI_ID and req.payment_status == "pending":
        upi_link = (
            f"upi://pay?pa={quote(config.UPI_ID)}&pn={quote(config.PAYEE_NAME)}"
            f"&am={req.fee}.00&cu=INR&tn={quote(req.tracking_id)}"
        )
    return {
        "tracking_id": req.tracking_id,
        "service_name_en": req.service.name_en,
        "service_name_hi": req.service.name_hi,
        "customer_name": req.name,
        "fee": req.fee,
        "payment_status": req.payment_status,
        "upi_id": config.UPI_ID or None,
        "payee_name": config.PAYEE_NAME,
        "upi_link": upi_link,
    }
