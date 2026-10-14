import csv
import io
import secrets
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from . import config, notify
from .db import get_db
from .models import PAYMENT_STATUSES, STATUSES, AdminUser, RequestEvent, Service, ServiceRequest, utcnow
from .routes_public import iso, pay_url
from .schemas import PaymentLinkIn, RequestPatch, ServiceIn
from .security import get_current_admin

router = APIRouter(prefix="/api/admin", dependencies=[Depends(get_current_admin)])

IST = timezone(timedelta(hours=5, minutes=30))  # India has no daylight saving


def ist_day_start_utc(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)


def to_ist_date(dt: datetime) -> date:
    return dt.replace(tzinfo=timezone.utc).astimezone(IST).date()


# ---------- serialisers ----------

def service_admin(s: Service) -> dict:
    return {
        "id": s.id, "slug": s.slug, "name_en": s.name_en, "name_hi": s.name_hi,
        "desc_en": s.desc_en, "desc_hi": s.desc_hi, "icon": s.icon, "fields": s.fields,
        "active": s.active, "sort_order": s.sort_order,
    }


def request_row(r: ServiceRequest) -> dict:
    return {
        "id": r.id, "tracking_id": r.tracking_id,
        "service": {"slug": r.service.slug, "name_en": r.service.name_en,
                    "name_hi": r.service.name_hi, "icon": r.service.icon},
        "name": r.name, "phone": r.phone, "status": r.status, "fee": r.fee,
        "payment_status": r.payment_status, "created_at": iso(r.created_at),
        "summary": _summary(r),
    }


def _plain(value) -> str:
    """Flatten a stored answer (passenger lists included) into readable text."""
    if isinstance(value, list):
        return ", ".join(
            f"{p.get('name', '')} ({p.get('age', '')})" if isinstance(p, dict) else str(p) for p in value
        )
    return str(value)


def _summary(r: ServiceRequest) -> str:
    parts = [_plain(v) for k, v in r.data.items() if k != "notes"][:3]
    return " · ".join(parts)


def request_detail(r: ServiceRequest) -> dict:
    out = request_row(r)
    out.update(
        service={**out["service"], "fields": r.service.fields},
        data=r.data, admin_note=r.admin_note, pay_url=pay_url(r.pay_token),
        paid_at=iso(r.paid_at), updated_at=iso(r.updated_at),
        events=[{"id": e.id, "kind": e.kind, "text": e.text, "actor": e.actor,
                 "created_at": iso(e.created_at)} for e in r.events],
    )
    return out


def _filtered(stmt, service, status, payment, q, date_from, date_to):
    if service:
        stmt = stmt.where(Service.slug == service)
    if status:
        stmt = stmt.where(ServiceRequest.status == status)
    if payment:
        stmt = stmt.where(ServiceRequest.payment_status == payment)
    if q:
        q = q.strip()[:60]
        stmt = stmt.where(or_(
            ServiceRequest.name.icontains(q, autoescape=True),
            ServiceRequest.phone.icontains(q, autoescape=True),
            ServiceRequest.tracking_id.icontains(q, autoescape=True),
        ))
    if date_from:
        stmt = stmt.where(ServiceRequest.created_at >= ist_day_start_utc(date_from))
    if date_to:
        stmt = stmt.where(ServiceRequest.created_at < ist_day_start_utc(date_to + timedelta(days=1)))
    return stmt


def _get_request(db: Session, request_id: int) -> ServiceRequest:
    req = db.get(ServiceRequest, request_id)
    if req is None:
        raise HTTPException(404, "not_found")
    return req


# ---------- dashboard ----------

@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    today = datetime.now(IST).date()
    first_day = today - timedelta(days=29)
    first_utc = ist_day_start_utc(first_day)

    total = db.scalar(select(func.count(ServiceRequest.id))) or 0
    today_count = db.scalar(
        select(func.count(ServiceRequest.id)).where(ServiceRequest.created_at >= ist_day_start_utc(today))
    ) or 0
    by_status = dict(db.execute(
        select(ServiceRequest.status, func.count()).group_by(ServiceRequest.status)
    ).all())
    revenue = db.scalar(
        select(func.coalesce(func.sum(ServiceRequest.fee), 0)).where(ServiceRequest.payment_status == "paid")
    )
    awaiting_amount, awaiting_count = db.execute(
        select(func.coalesce(func.sum(ServiceRequest.fee), 0), func.count())
        .where(ServiceRequest.payment_status == "pending")
    ).one()

    by_service = [
        {"slug": slug, "name_en": en, "name_hi": hi, "icon": icon, "count": count}
        for slug, en, hi, icon, count in db.execute(
            select(Service.slug, Service.name_en, Service.name_hi, Service.icon, func.count(ServiceRequest.id))
            .outerjoin(ServiceRequest, ServiceRequest.service_id == Service.id)
            .group_by(Service.id).order_by(Service.sort_order, Service.id)
        ).all()
    ]

    days = {first_day + timedelta(days=i): {"requests": 0, "revenue": 0} for i in range(30)}
    for (created,) in db.execute(select(ServiceRequest.created_at).where(ServiceRequest.created_at >= first_utc)):
        days[to_ist_date(created)]["requests"] += 1
    for paid_at, fee in db.execute(
        select(ServiceRequest.paid_at, ServiceRequest.fee)
        .where(ServiceRequest.payment_status == "paid", ServiceRequest.paid_at >= first_utc)
    ):
        days[to_ist_date(paid_at)]["revenue"] += fee or 0

    open_count = sum(by_status.get(s, 0) for s in ("new", "in_progress", "waiting_customer"))
    done_count = sum(by_status.get(s, 0) for s in ("done", "delivered"))
    return {
        "totals": {
            "total": total, "today": today_count, "open": open_count, "done": done_count,
            "revenue": revenue, "awaiting_amount": awaiting_amount, "awaiting_count": awaiting_count,
        },
        "by_status": [{"status": s, "count": by_status.get(s, 0)} for s in STATUSES],
        "by_service": by_service,
        "trend": [{"date": d.isoformat(), **v} for d, v in days.items()],
    }


# ---------- requests ----------

def _list_stmt(service, status, payment, q, date_from, date_to):
    stmt = select(ServiceRequest).join(Service, Service.id == ServiceRequest.service_id)
    return _filtered(stmt, service, status, payment, q, date_from, date_to)


@router.get("/requests")
def list_requests(
    service: str | None = None, status: str | None = None, payment: str | None = None,
    q: str | None = None, date_from: date | None = None, date_to: date | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    base = _list_stmt(service, status, payment, q, date_from, date_to)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.options(joinedload(ServiceRequest.service))
        .order_by(ServiceRequest.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"items": [request_row(r) for r in rows], "total": total, "page": page, "page_size": page_size}


def _csv_safe(value) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@router.get("/requests/export.csv")
def export_csv(
    service: str | None = None, status: str | None = None, payment: str | None = None,
    q: str | None = None, date_from: date | None = None, date_to: date | None = None,
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        _list_stmt(service, status, payment, q, date_from, date_to)
        .options(joinedload(ServiceRequest.service)).order_by(ServiceRequest.id.desc()).limit(10000)
    ).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Tracking ID", "Created (IST)", "Service", "Name", "Phone", "Status",
                     "Fee", "Payment", "Details"])
    for r in rows:
        created = r.created_at.replace(tzinfo=timezone.utc).astimezone(IST).strftime("%Y-%m-%d %H:%M")
        details = "; ".join(f"{k}: {_plain(v)}" for k, v in r.data.items())
        writer.writerow([_csv_safe(x) for x in (
            r.tracking_id, created, r.service.name_en, r.name, r.phone, r.status,
            r.fee, r.payment_status, details)])
    # BOM so Excel shows Hindi text correctly.
    payload = "\ufeff" + buf.getvalue()
    return StreamingResponse(
        iter([payload]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="requests.csv"'},
    )


@router.get("/requests/{request_id}")
def get_request(request_id: int, db: Session = Depends(get_db)):
    return request_detail(_get_request(db, request_id))


@router.patch("/requests/{request_id}")
def patch_request(
    request_id: int, body: RequestPatch,
    admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db),
):
    req = _get_request(db, request_id)

    if body.status is not None and body.status != req.status:
        if body.status not in STATUSES:
            raise HTTPException(422, "invalid_status")
        req.events.append(RequestEvent(kind="status", text=f"{req.status} → {body.status}", actor=admin.username))
        req.status = body.status

    if body.fee is not None and body.fee != req.fee:
        if req.payment_status == "paid":
            raise HTTPException(400, "already_paid")
        req.events.append(RequestEvent(kind="fee", text=f"Fee set to ₹{body.fee}", actor=admin.username))
        req.fee = body.fee

    if body.admin_note is not None and body.admin_note != req.admin_note:
        req.admin_note = body.admin_note
        req.events.append(RequestEvent(kind="note", text="Internal note updated", actor=admin.username))

    req.updated_at = utcnow()
    db.commit()
    return request_detail(req)


def _payment_message(req: ServiceRequest, link: str) -> str:
    return (
        f"{config.COMPANY_NAME_EN}: Your {req.service.name_en} request {req.tracking_id} is ready. "
        f"Please pay Rs {req.fee} here: {link}\n"
        f"{config.COMPANY_NAME_HI}: आपका {req.service.name_hi} ({req.tracking_id}) तैयार है। "
        f"कृपया Rs {req.fee} का भुगतान करें: {link}"
    )


@router.post("/requests/{request_id}/payment-link")
def send_payment_link(
    request_id: int, body: PaymentLinkIn,
    admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db),
):
    req = _get_request(db, request_id)
    if req.payment_status == "paid":
        raise HTTPException(400, "already_paid")
    if not req.fee or req.fee <= 0:
        raise HTTPException(400, "fee_required")

    if not req.pay_token:
        req.pay_token = secrets.token_urlsafe(16)
    req.payment_status = "pending"
    link = pay_url(req.pay_token)
    message = _payment_message(req, link)

    result = notify.send(req.phone, message, body.channel)
    outcome = "sent" if result["sent"] else "not sent automatically"
    req.events.append(RequestEvent(
        kind="payment_link", actor=admin.username,
        text=f"Payment link ₹{req.fee} via {body.channel}: {outcome}"))
    req.updated_at = utcnow()
    db.commit()
    return {
        "pay_url": link, "message": message, "delivery": result,
        "whatsapp_url": f"https://wa.me/91{req.phone}?text={quote(message)}",
        "request": request_detail(req),
    }


@router.post("/requests/{request_id}/mark-paid")
def mark_paid(
    request_id: int,
    admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db),
):
    req = _get_request(db, request_id)
    if req.payment_status == "paid":
        raise HTTPException(400, "already_paid")
    if req.fee is None:
        raise HTTPException(400, "fee_required")
    req.payment_status = "paid"
    req.paid_at = utcnow()
    req.events.append(RequestEvent(kind="paid", text=f"Payment of ₹{req.fee} received", actor=admin.username))
    req.updated_at = utcnow()
    db.commit()
    return request_detail(req)


# ---------- services ----------

@router.get("/services")
def list_services(db: Session = Depends(get_db)):
    rows = db.scalars(select(Service).order_by(Service.sort_order, Service.id)).all()
    return [service_admin(s) for s in rows]


@router.post("/services", status_code=201)
def create_service(body: ServiceIn, db: Session = Depends(get_db)):
    if db.scalar(select(Service.id).where(Service.slug == body.slug)):
        raise HTTPException(409, "slug_exists")
    svc = Service(**body.model_dump())
    db.add(svc)
    db.commit()
    return service_admin(svc)


@router.put("/services/{service_id}")
def update_service(service_id: int, body: ServiceIn, db: Session = Depends(get_db)):
    svc = db.get(Service, service_id)
    if svc is None:
        raise HTTPException(404, "not_found")
    for key, value in body.model_dump(exclude={"slug"}).items():  # slug stays stable
        setattr(svc, key, value)
    db.commit()
    return service_admin(svc)


