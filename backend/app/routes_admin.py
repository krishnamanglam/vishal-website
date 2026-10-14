import csv
import io
import re
import secrets
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from . import config, notify
from .db import get_db, object_id
from .models import STATUSES, utcnow
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

def service_admin(s: dict) -> dict:
    return {
        "id": str(s["_id"]), "slug": s["slug"], "name_en": s["name_en"], "name_hi": s["name_hi"],
        "desc_en": s.get("desc_en", ""), "desc_hi": s.get("desc_hi", ""), "icon": s.get("icon", "📄"),
        "fields": s.get("fields", []), "active": s.get("active", True), "sort_order": s.get("sort_order", 0),
    }


def _services_by_id(db: Database) -> dict:
    return {s["_id"]: s for s in db.services.find()}


def _plain(value) -> str:
    """Flatten a stored answer (passenger lists included) into readable text."""
    if isinstance(value, list):
        return ", ".join(
            f"{p.get('name', '')} ({p.get('age', '')})" if isinstance(p, dict) else str(p) for p in value
        )
    return str(value)


def _summary(r: dict) -> str:
    parts = [_plain(v) for k, v in r.get("data", {}).items() if k != "notes"][:3]
    return " · ".join(parts)


def request_row(r: dict, services: dict) -> dict:
    s = services.get(r["service_id"], {})
    return {
        "id": str(r["_id"]), "tracking_id": r["tracking_id"],
        "service": {"slug": s.get("slug", r.get("service_slug", "")), "name_en": s.get("name_en", ""),
                    "name_hi": s.get("name_hi", ""), "icon": s.get("icon", "📄")},
        "name": r["name"], "phone": r["phone"], "status": r["status"], "fee": r.get("fee"),
        "payment_status": r["payment_status"], "created_at": iso(r["created_at"]),
        "summary": _summary(r),
    }


def request_detail(r: dict, services: dict) -> dict:
    out = request_row(r, services)
    service = services.get(r["service_id"], {})
    out.update(
        service={**out["service"], "fields": service.get("fields", [])},
        data=r.get("data", {}), admin_note=r.get("admin_note", ""), pay_url=pay_url(r.get("pay_token")),
        paid_at=iso(r.get("paid_at")), updated_at=iso(r["updated_at"]),
        events=[{"id": i, "kind": e["kind"], "text": e["text"], "actor": e["actor"],
                 "created_at": iso(e["created_at"])} for i, e in enumerate(r.get("events", []))],
    )
    return out


def _query(service, status, payment, q, date_from, date_to) -> dict:
    query: dict = {}
    if service:
        query["service_slug"] = service
    if status:
        query["status"] = status
    if payment:
        query["payment_status"] = payment
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        query["$or"] = [{"name": rx}, {"phone": rx}, {"tracking_id": rx}]
    created: dict = {}
    if date_from:
        created["$gte"] = ist_day_start_utc(date_from)
    if date_to:
        created["$lt"] = ist_day_start_utc(date_to + timedelta(days=1))
    if created:
        query["created_at"] = created
    return query


def _get_request(db: Database, request_id: str) -> dict:
    oid = object_id(request_id)
    req = db.requests.find_one({"_id": oid}) if oid else None
    if req is None:
        raise HTTPException(404, "not_found")
    return req


# ---------- dashboard ----------

@router.get("/stats")
def stats(db: Database = Depends(get_db)):
    today = datetime.now(IST).date()
    first_day = today - timedelta(days=29)
    first_utc = ist_day_start_utc(first_day)
    reqs = db.requests

    total = reqs.count_documents({})
    today_count = reqs.count_documents({"created_at": {"$gte": ist_day_start_utc(today)}})
    by_status = {d["_id"]: d["n"] for d in reqs.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}

    def money(payment_status: str):
        rows = list(reqs.aggregate([
            {"$match": {"payment_status": payment_status}},
            {"$group": {"_id": None, "amount": {"$sum": {"$ifNull": ["$fee", 0]}}, "n": {"$sum": 1}}},
        ]))
        return (rows[0]["amount"], rows[0]["n"]) if rows else (0, 0)

    revenue, _ = money("paid")
    awaiting_amount, awaiting_count = money("pending")

    counts = {d["_id"]: d["n"] for d in reqs.aggregate([{"$group": {"_id": "$service_slug", "n": {"$sum": 1}}}])}
    by_service = [
        {"slug": s["slug"], "name_en": s["name_en"], "name_hi": s["name_hi"], "icon": s.get("icon", "📄"),
         "count": counts.get(s["slug"], 0)}
        for s in db.services.find().sort([("sort_order", 1), ("_id", 1)])
    ]

    days = {first_day + timedelta(days=i): {"requests": 0, "revenue": 0} for i in range(30)}
    for r in reqs.find({"created_at": {"$gte": first_utc}}, {"created_at": 1}):
        days[to_ist_date(r["created_at"])]["requests"] += 1
    for r in reqs.find({"payment_status": "paid", "paid_at": {"$gte": first_utc}}, {"paid_at": 1, "fee": 1}):
        days[to_ist_date(r["paid_at"])]["revenue"] += r.get("fee") or 0

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

@router.get("/requests")
def list_requests(
    service: str | None = None, status: str | None = None, payment: str | None = None,
    q: str | None = None, date_from: date | None = None, date_to: date | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Database = Depends(get_db),
):
    query = _query(service, status, payment, q, date_from, date_to)
    total = db.requests.count_documents(query)
    rows = list(
        db.requests.find(query).sort([("created_at", -1), ("_id", -1)]).skip((page - 1) * page_size).limit(page_size)
    )
    services = _services_by_id(db)
    return {"items": [request_row(r, services) for r in rows], "total": total, "page": page, "page_size": page_size}


def _csv_safe(value) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@router.get("/requests/export.csv")
def export_csv(
    service: str | None = None, status: str | None = None, payment: str | None = None,
    q: str | None = None, date_from: date | None = None, date_to: date | None = None,
    db: Database = Depends(get_db),
):
    query = _query(service, status, payment, q, date_from, date_to)
    rows = list(db.requests.find(query).sort([("created_at", -1), ("_id", -1)]).limit(10000))
    services = _services_by_id(db)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Tracking ID", "Created (IST)", "Service", "Name", "Phone", "Status",
                     "Fee", "Payment", "Details"])
    for r in rows:
        created = r["created_at"].replace(tzinfo=timezone.utc).astimezone(IST).strftime("%Y-%m-%d %H:%M")
        details = "; ".join(f"{k}: {_plain(v)}" for k, v in r.get("data", {}).items())
        writer.writerow([_csv_safe(x) for x in (
            r["tracking_id"], created, services.get(r["service_id"], {}).get("name_en", ""), r["name"],
            r["phone"], r["status"], r.get("fee"), r["payment_status"], details)])
    # BOM so Excel shows Hindi text correctly.
    payload = "\ufeff" + buf.getvalue()
    return StreamingResponse(
        iter([payload]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="requests.csv"'},
    )


@router.get("/requests/{request_id}")
def get_request(request_id: str, db: Database = Depends(get_db)):
    return request_detail(_get_request(db, request_id), _services_by_id(db))


def _event(kind: str, text: str, actor: str) -> dict:
    return {"kind": kind, "text": text, "actor": actor, "created_at": utcnow()}


def _apply(db: Database, req: dict, sets: dict, events: list) -> dict:
    sets["updated_at"] = utcnow()
    update: dict = {"$set": sets}
    if events:
        update["$push"] = {"events": {"$each": events}}
    db.requests.update_one({"_id": req["_id"]}, update)
    return request_detail(db.requests.find_one({"_id": req["_id"]}), _services_by_id(db))


@router.patch("/requests/{request_id}")
def patch_request(
    request_id: str, body: RequestPatch,
    admin: dict = Depends(get_current_admin), db: Database = Depends(get_db),
):
    req = _get_request(db, request_id)
    who = admin["username"]
    sets: dict = {}
    events: list = []

    if body.status is not None and body.status != req["status"]:
        if body.status not in STATUSES:
            raise HTTPException(422, "invalid_status")
        events.append(_event("status", f"{req['status']} → {body.status}", who))
        sets["status"] = body.status

    if body.fee is not None and body.fee != req.get("fee"):
        if req["payment_status"] == "paid":
            raise HTTPException(400, "already_paid")
        events.append(_event("fee", f"Fee set to ₹{body.fee}", who))
        sets["fee"] = body.fee

    if body.admin_note is not None and body.admin_note != req.get("admin_note", ""):
        sets["admin_note"] = body.admin_note
        events.append(_event("note", "Internal note updated", who))

    return _apply(db, req, sets, events)


def _payment_message(req: dict, service: dict, link: str) -> str:
    return (
        f"{config.COMPANY_NAME_EN}: Your {service.get('name_en', '')} request {req['tracking_id']} is ready. "
        f"Please pay Rs {req['fee']} here: {link}\n"
        f"{config.COMPANY_NAME_HI}: आपका {service.get('name_hi', '')} ({req['tracking_id']}) तैयार है। "
        f"कृपया Rs {req['fee']} का भुगतान करें: {link}"
    )


@router.post("/requests/{request_id}/payment-link")
def send_payment_link(
    request_id: str, body: PaymentLinkIn,
    admin: dict = Depends(get_current_admin), db: Database = Depends(get_db),
):
    req = _get_request(db, request_id)
    if req["payment_status"] == "paid":
        raise HTTPException(400, "already_paid")
    if not req.get("fee") or req["fee"] <= 0:
        raise HTTPException(400, "fee_required")

    token = req.get("pay_token") or secrets.token_urlsafe(16)
    link = pay_url(token)
    service = db.services.find_one({"_id": req["service_id"]}) or {}
    message = _payment_message(req, service, link)

    result = notify.send(req["phone"], message, body.channel)
    outcome = "sent" if result["sent"] else "not sent automatically"
    event = _event("payment_link", f"Payment link ₹{req['fee']} via {body.channel}: {outcome}", admin["username"])
    detail = _apply(db, req, {"pay_token": token, "payment_status": "pending"}, [event])
    return {
        "pay_url": link, "message": message, "delivery": result,
        "whatsapp_url": f"https://wa.me/91{req['phone']}?text={quote(message)}",
        "request": detail,
    }


@router.post("/requests/{request_id}/mark-paid")
def mark_paid(
    request_id: str,
    admin: dict = Depends(get_current_admin), db: Database = Depends(get_db),
):
    req = _get_request(db, request_id)
    if req["payment_status"] == "paid":
        raise HTTPException(400, "already_paid")
    if req.get("fee") is None:
        raise HTTPException(400, "fee_required")
    event = _event("paid", f"Payment of ₹{req['fee']} received", admin["username"])
    return _apply(db, req, {"payment_status": "paid", "paid_at": utcnow()}, [event])


# ---------- services ----------

@router.get("/services")
def list_services(db: Database = Depends(get_db)):
    return [service_admin(s) for s in db.services.find().sort([("sort_order", 1), ("_id", 1)])]


@router.post("/services", status_code=201)
def create_service(body: ServiceIn, db: Database = Depends(get_db)):
    doc = body.model_dump()
    try:
        db.services.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "slug_exists")
    return service_admin(doc)


@router.put("/services/{service_id}")
def update_service(service_id: str, body: ServiceIn, db: Database = Depends(get_db)):
    oid = object_id(service_id)
    if oid is None or db.services.find_one({"_id": oid}) is None:
        raise HTTPException(404, "not_found")
    db.services.update_one({"_id": oid}, {"$set": body.model_dump(exclude={"slug"})})  # slug stays stable
    return service_admin(db.services.find_one({"_id": oid}))

