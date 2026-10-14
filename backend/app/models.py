"""Shared constants. Data is stored as MongoDB documents (see db.py), not ORM models.

Collections
  admin_users  {username, password_hash}
  services     {slug, name_en, name_hi, desc_en, desc_hi, icon, fields[], active, sort_order}
  requests     {tracking_id, service_id, service_slug, name, phone, data{}, status, fee,
                payment_status, pay_token?, paid_at, admin_note, created_at, updated_at,
                events[{kind, text, actor, created_at}]}
  settings     {_id: "secret_key", value}
"""
from datetime import datetime, timezone

STATUSES = ["new", "in_progress", "waiting_customer", "done", "delivered", "rejected"]
PAYMENT_STATUSES = ["none", "pending", "paid"]


def utcnow() -> datetime:
    """Naive UTC timestamp (MongoDB stores UTC and returns naive datetimes)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
