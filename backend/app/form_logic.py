"""Validates a customer's answers against a service's dynamic field definitions."""
from datetime import date
from typing import Any

from fastapi import HTTPException

from .schemas import FieldDef

TEXT_LIMITS = {"text": 200, "textarea": 1000, "tel": 20}


def _is_visible(field: FieldDef, cleaned: dict) -> bool:
    if field.show_if is None:
        return True
    return cleaned.get(field.show_if.key) == field.show_if.equals


def clean_submission(raw_fields: list[dict], data: dict[str, Any]) -> dict:
    """Return only known, visible, validated values. Raises 422 with per-field codes."""
    fields = [FieldDef.model_validate(f) for f in raw_fields]
    cleaned: dict[str, Any] = {}
    errors: dict[str, str] = {}

    for field in fields:  # order matters: show_if / count_from refer to earlier fields
        if not _is_visible(field, cleaned):
            continue

        if field.type == "passengers":
            people = _clean_people(field, data.get(field.key), cleaned.get(field.count_from), errors)
            if people is not None:
                cleaned[field.key] = people
            continue

        value = data.get(field.key)
        if isinstance(value, str):
            value = value.strip()
        if value in (None, ""):
            if field.required:
                errors[field.key] = "required"
            continue

        try:
            cleaned[field.key] = _convert(field, value)
        except ValueError as exc:
            errors[field.key] = str(exc) or "invalid"

    if errors:
        raise HTTPException(422, {"errors": errors})
    return cleaned


GENDERS = {"male", "female", "other"}
MAX_PEOPLE = 20


def _clean_people(field: FieldDef, rows: Any, count: Any, errors: dict) -> list[dict] | None:
    """One row per person: name, age, gender. The row count must match the number field."""
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        return None  # nothing to collect yet (count itself is validated on its own field)
    if count > MAX_PEOPLE:
        errors[field.count_from] = "too_large"
        return None
    if not isinstance(rows, list) or len(rows) != count:
        errors[field.key] = "required"
        return None

    people: list[dict] = []
    ok = True
    for i, row in enumerate(rows):
        row = row if isinstance(row, dict) else {}
        prefix = f"{field.key}.{i}"

        name = str(row.get("name") or "").strip()
        if not name:
            errors[f"{prefix}.name"], ok = "required", False
        elif len(name) < 2 or len(name) > 80:
            errors[f"{prefix}.name"], ok = "invalid", False

        age = None
        raw_age = row.get("age")
        if raw_age in (None, ""):
            errors[f"{prefix}.age"], ok = "required", False
        else:
            try:
                age = int(str(raw_age))
                if isinstance(raw_age, bool) or not 0 <= age <= 120:
                    raise ValueError
            except ValueError:
                errors[f"{prefix}.age"], ok = "invalid", False

        gender = row.get("gender")
        if gender in (None, ""):
            errors[f"{prefix}.gender"], ok = "required", False
        elif gender not in GENDERS:
            errors[f"{prefix}.gender"], ok = "invalid", False

        people.append({"name": name, "age": age, "gender": gender})
    return people if ok else None


def _convert(field: FieldDef, value: Any) -> Any:
    if field.type == "number":
        if isinstance(value, bool):
            raise ValueError("invalid")
        try:
            number = int(str(value))
        except ValueError:
            raise ValueError("invalid")
        if field.min_value is not None and number < field.min_value:
            raise ValueError("too_small")
        if field.max_value is not None and number > field.max_value:
            raise ValueError("too_large")
        return number

    if not isinstance(value, str):
        raise ValueError("invalid")

    if field.type == "date":
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            raise ValueError("invalid")

    if field.type == "select":
        if value not in {o.value for o in field.options}:
            raise ValueError("invalid")
        return value

    if field.type == "tel":
        import re

        if not re.fullmatch(r"[0-9+\-\s]{5,20}", value):
            raise ValueError("invalid")
        return value

    if len(value) > TEXT_LIMITS[field.type]:
        raise ValueError("too_long")
    return value
