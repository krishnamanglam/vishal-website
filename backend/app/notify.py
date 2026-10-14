"""Sends text messages to customers.

NOTIFY_PROVIDER=none   -> nothing is sent, the admin uses the WhatsApp click-to-send link.
NOTIFY_PROVIDER=twilio -> SMS or WhatsApp through Twilio's REST API.

Note for India: promotional/transactional SMS needs DLT registration, and
business-initiated WhatsApp messages need an approved template. Check your
provider's rules before relying on automatic delivery.
"""
import logging

import httpx

from . import config

log = logging.getLogger("notify")


def send(phone10: str, message: str, channel: str) -> dict:
    """Return {"sent": bool, "provider": str, "detail": str}."""
    if config.NOTIFY_PROVIDER != "twilio":
        return {"sent": False, "provider": "none", "detail": "automatic sending is off"}

    if not (config.TWILIO_ACCOUNT_SID and config.TWILIO_AUTH_TOKEN):
        return {"sent": False, "provider": "twilio", "detail": "twilio credentials missing"}

    to = f"+91{phone10}"
    if channel == "whatsapp":
        raw_sender = config.TWILIO_WHATSAPP_FROM.removeprefix("whatsapp:").strip()
        sender = f"whatsapp:{raw_sender}" if raw_sender else ""
        to = f"whatsapp:{to}"
    else:
        sender = config.TWILIO_SMS_FROM.strip()
    if not sender:
        return {"sent": False, "provider": "twilio", "detail": f"no sender number for {channel}"}

    url = f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Messages.json"
    try:
        resp = httpx.post(
            url,
            data={"To": to, "From": sender, "Body": message},
            auth=(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN),
            timeout=15,
        )
    except httpx.HTTPError as exc:
        log.warning("Twilio request failed: %s", exc)
        return {"sent": False, "provider": "twilio", "detail": "network error"}

    if resp.status_code >= 400:
        log.warning("Twilio error %s: %s", resp.status_code, resp.text[:300])
        return {"sent": False, "provider": "twilio", "detail": f"provider error {resp.status_code}"}
    return {"sent": True, "provider": "twilio", "detail": "queued"}
