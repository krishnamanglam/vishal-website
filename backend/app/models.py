from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

STATUSES = ["new", "in_progress", "waiting_customer", "done", "delivered", "rejected"]
PAYMENT_STATUSES = ["none", "pending", "paid"]


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite does not keep tzinfo)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(60), unique=True)
    password_hash: Mapped[str] = mapped_column(String(300))


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name_en: Mapped[str] = mapped_column(String(120))
    name_hi: Mapped[str] = mapped_column(String(120))
    desc_en: Mapped[str] = mapped_column(String(400), default="")
    desc_hi: Mapped[str] = mapped_column(String(400), default="")
    icon: Mapped[str] = mapped_column(String(8), default="📄")
    # List of field definitions: this is what makes the form dynamic.
    fields: Mapped[list] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ServiceRequest(Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    tracking_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(10), index=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    fee: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_status: Mapped[str] = mapped_column(String(10), default="none", index=True)
    pay_token: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    admin_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    service: Mapped[Service] = relationship()
    events: Mapped[list["RequestEvent"]] = relationship(
        order_by="RequestEvent.id", cascade="all, delete-orphan"
    )


class RequestEvent(Base):
    """Audit trail: created, status change, note, payment link sent, paid."""

    __tablename__ = "request_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(String(500), default="")
    actor: Mapped[str] = mapped_column(String(60), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
