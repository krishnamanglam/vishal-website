import secrets

from pymongo.database import Database

from . import config
from .security import hash_password


def _opt(value, en, hi=None):
    return {"value": value, "label_en": en, "label_hi": hi or en}


NOTES_FIELD = {
    "key": "notes",
    "type": "textarea",
    "label_en": "Reason / extra details",
    "label_hi": "कारण / अन्य जानकारी",
    "required": False,
}

PASSENGER_FIELD = {
    "key": "passenger_list",
    "type": "passengers",
    "count_from": "passengers",
    "required": True,
    "label_en": "Passenger details",
    "label_hi": "यात्रियों की जानकारी",
}

DEFAULT_SERVICES = [
    {
        "slug": "train-ticket",
        "name_en": "Train Ticket",
        "name_hi": "ट्रेन टिकट",
        "desc_en": "Book reserved or Tatkal train tickets.",
        "desc_hi": "रिज़र्व या तत्काल ट्रेन टिकट बुक कराएं।",
        "icon": "🚆",
        "sort_order": 1,
        "fields": [
            {"key": "from_station", "type": "text", "required": True,
             "label_en": "From station", "label_hi": "कहाँ से (स्टेशन)"},
            {"key": "to_station", "type": "text", "required": True,
             "label_en": "To station", "label_hi": "कहाँ तक (स्टेशन)"},
            {"key": "journey_date", "type": "date", "required": True,
             "label_en": "Journey date", "label_hi": "यात्रा की तारीख"},
            {"key": "travel_class", "type": "select", "required": True,
             "label_en": "Class", "label_hi": "श्रेणी",
             "options": [_opt("SL", "Sleeper (SL)", "स्लीपर (SL)"), _opt("3A", "AC 3 Tier (3A)", "थर्ड एसी (3A)"),
                         _opt("2A", "AC 2 Tier (2A)", "सेकंड एसी (2A)"), _opt("1A", "AC First (1A)", "फर्स्ट एसी (1A)"),
                         _opt("CC", "Chair Car (CC)", "चेयर कार (CC)"), _opt("2S", "Second Sitting (2S)", "सेकंड सीटिंग (2S)")]},
            {"key": "passengers", "type": "number", "required": True, "min_value": 1, "max_value": 6,
             "label_en": "Number of passengers (max 6)", "label_hi": "यात्रियों की संख्या (अधिकतम 6)"},
            PASSENGER_FIELD,
            {"key": "train", "type": "text", "required": False,
             "label_en": "Preferred train name / number", "label_hi": "पसंदीदा ट्रेन का नाम / नंबर"},
            NOTES_FIELD,
        ],
    },
    {
        "slug": "flight-ticket",
        "name_en": "Flight Ticket",
        "name_hi": "हवाई टिकट",
        "desc_en": "Domestic and international flight tickets.",
        "desc_hi": "घरेलू और अंतरराष्ट्रीय हवाई टिकट।",
        "icon": "✈️",
        "sort_order": 2,
        "fields": [
            {"key": "from_city", "type": "text", "required": True,
             "label_en": "From city / airport", "label_hi": "कहाँ से (शहर / एयरपोर्ट)"},
            {"key": "to_city", "type": "text", "required": True,
             "label_en": "To city / airport", "label_hi": "कहाँ तक (शहर / एयरपोर्ट)"},
            {"key": "trip_type", "type": "select", "required": True,
             "label_en": "Trip type", "label_hi": "यात्रा का प्रकार",
             "options": [_opt("oneway", "One way", "एक तरफ़ा"), _opt("return", "Return", "आना-जाना")]},
            {"key": "journey_date", "type": "date", "required": True,
             "label_en": "Departure date", "label_hi": "जाने की तारीख"},
            {"key": "return_date", "type": "date", "required": True,
             "label_en": "Return date", "label_hi": "वापसी की तारीख",
             "show_if": {"key": "trip_type", "equals": "return"}},
            {"key": "passengers", "type": "number", "required": True, "min_value": 1, "max_value": 9,
             "label_en": "Number of passengers", "label_hi": "यात्रियों की संख्या"},
            PASSENGER_FIELD,
            NOTES_FIELD,
        ],
    },
    {
        "slug": "passport",
        "name_en": "Passport",
        "name_hi": "पासपोर्ट",
        "desc_en": "Fresh passport, renewal and related help.",
        "desc_hi": "नया पासपोर्ट, नवीनीकरण और संबंधित सहायता।",
        "icon": "🛂",
        "sort_order": 3,
        "fields": [
            {"key": "application_type", "type": "select", "required": True,
             "label_en": "Application type", "label_hi": "आवेदन का प्रकार",
             "options": [_opt("fresh", "Fresh passport", "नया पासपोर्ट"), _opt("renewal", "Renewal / re-issue", "नवीनीकरण / री-इश्यू"),
                         _opt("lost", "Lost or damaged", "खोया या क्षतिग्रस्त")]},
            {"key": "old_passport_no", "type": "text", "required": False,
             "label_en": "Old passport number", "label_hi": "पुराना पासपोर्ट नंबर",
             "show_if": {"key": "application_type", "equals": "renewal"}},
            {"key": "date_of_birth", "type": "date", "required": True,
             "label_en": "Date of birth", "label_hi": "जन्म तिथि"},
            {"key": "scheme", "type": "select", "required": True,
             "label_en": "Scheme", "label_hi": "योजना",
             "options": [_opt("normal", "Normal", "सामान्य"), _opt("tatkal", "Tatkal", "तत्काल")]},
            {"key": "booklet", "type": "select", "required": False,
             "label_en": "Booklet size", "label_hi": "बुकलेट",
             "options": [_opt("36", "36 pages", "36 पन्ने"), _opt("60", "60 pages", "60 पन्ने")]},
            NOTES_FIELD,
        ],
    },
    {
        "slug": "pollution-certificate",
        "name_en": "Pollution (PUC) Certificate",
        "name_hi": "प्रदूषण (PUC) प्रमाणपत्र",
        "desc_en": "Pollution Under Control certificate for your vehicle.",
        "desc_hi": "आपके वाहन के लिए प्रदूषण नियंत्रण प्रमाणपत्र।",
        "icon": "🌿",
        "sort_order": 4,
        "fields": [
            {"key": "vehicle_number", "type": "text", "required": True,
             "label_en": "Vehicle number", "label_hi": "वाहन नंबर"},
            {"key": "vehicle_type", "type": "select", "required": True,
             "label_en": "Vehicle type", "label_hi": "वाहन का प्रकार",
             "options": [_opt("2w", "Two wheeler", "दोपहिया"), _opt("3w", "Three wheeler", "तिपहिया"),
                         _opt("car", "Car / Jeep", "कार / जीप"), _opt("hv", "Truck / Bus", "ट्रक / बस"),
                         _opt("tractor", "Tractor", "ट्रैक्टर")]},
            {"key": "fuel_type", "type": "select", "required": True,
             "label_en": "Fuel type", "label_hi": "ईंधन का प्रकार",
             "options": [_opt("petrol", "Petrol", "पेट्रोल"), _opt("diesel", "Diesel", "डीज़ल"),
                         _opt("cng", "CNG", "सीएनजी"), _opt("lpg", "LPG", "एलपीजी")]},
            {"key": "previous_expiry", "type": "date", "required": False,
             "label_en": "Previous PUC expiry date", "label_hi": "पिछले PUC की समाप्ति तिथि"},
            NOTES_FIELD,
        ],
    },
]



def seed(db: Database) -> None:
    """Create the default services and the first admin. Safe to run on every start,
    and safe if two server copies start at the same moment."""
    for item in DEFAULT_SERVICES:
        db.services.update_one({"slug": item["slug"]}, {"$setOnInsert": {**item, "active": True}}, upsert=True)

    if db.admin_users.count_documents({}, limit=1) == 0:
        password = config.ADMIN_PASSWORD
        generated = not password
        if generated:
            password = secrets.token_urlsafe(9)
        result = db.admin_users.update_one(
            {"username": config.ADMIN_USERNAME},
            {"$setOnInsert": {"username": config.ADMIN_USERNAME, "password_hash": hash_password(password)}},
            upsert=True,
        )
        if generated and result.upserted_id is not None:
            print("=" * 60, flush=True)
            print(f" Admin account created.  Username: {config.ADMIN_USERNAME}", flush=True)
            print(f" Password (shown once, change it after login): {password}", flush=True)
            print("=" * 60, flush=True)

