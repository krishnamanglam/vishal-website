import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

FieldType = Literal["text", "textarea", "number", "date", "select", "tel", "passengers"]
RESERVED_KEYS = {"name", "phone"}


def normalize_phone(raw: str) -> str:
    """Return a 10 digit Indian mobile number or raise ValueError."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise ValueError("invalid_phone")
    return digits


class Option(BaseModel):
    value: str = Field(min_length=1, max_length=60)
    label_en: str = Field(min_length=1, max_length=80)
    label_hi: str = Field(min_length=1, max_length=80)


class ShowIf(BaseModel):
    key: str
    equals: str


class FieldDef(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    type: FieldType
    label_en: str = Field(min_length=1, max_length=120)
    label_hi: str = Field(min_length=1, max_length=120)
    required: bool = False
    options: list[Option] = Field(default_factory=list, max_length=40)
    min_value: int | None = None
    max_value: int | None = None
    show_if: ShowIf | None = None
    # For type "passengers": key of the number field that says how many people.
    count_from: str | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.key in RESERVED_KEYS:
            raise ValueError(f"'{self.key}' is reserved")
        if self.type == "select" and not self.options:
            raise ValueError("select fields need options")
        if self.type == "passengers" and not self.count_from:
            raise ValueError("passengers fields need count_from")
        return self


class ServiceIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z][a-z0-9-]{1,39}$")
    name_en: str = Field(min_length=1, max_length=120)
    name_hi: str = Field(min_length=1, max_length=120)
    desc_en: str = Field(default="", max_length=400)
    desc_hi: str = Field(default="", max_length=400)
    icon: str = Field(default="📄", max_length=8)
    fields: list[FieldDef] = Field(default_factory=list, max_length=30)
    active: bool = True
    sort_order: int = 0

    @model_validator(mode="after")
    def _unique_keys(self):
        keys = [f.key for f in self.fields]
        if len(keys) != len(set(keys)):
            raise ValueError("field keys must be unique")
        for f in self.fields:
            if f.show_if and f.show_if.key not in keys:
                raise ValueError(f"show_if refers to unknown field '{f.show_if.key}'")
        earlier_numbers: set[str] = set()
        for f in self.fields:
            if f.type == "passengers" and f.count_from not in earlier_numbers:
                raise ValueError("count_from must be a number field placed before this field")
            if f.type == "number":
                earlier_numbers.add(f.key)
        return self


class RequestCreate(BaseModel):
    service_slug: str = Field(max_length=40)
    name: str = Field(min_length=2, max_length=100)
    phone: str
    data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("invalid_name")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class TrackIn(BaseModel):
    tracking_id: str = Field(max_length=30)
    phone: str = Field(max_length=20)


class LoginIn(BaseModel):
    username: str = Field(max_length=60)
    password: str = Field(max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class RequestPatch(BaseModel):
    status: str | None = None
    fee: int | None = Field(default=None, ge=0, le=1_000_000)
    admin_note: str | None = Field(default=None, max_length=2000)


class PaymentLinkIn(BaseModel):
    channel: Literal["whatsapp", "sms"] = "whatsapp"

