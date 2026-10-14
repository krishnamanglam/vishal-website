"""MongoDB access. One shared client per server process (important on serverless hosts)."""
import secrets

import certifi
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from . import config

_client: MongoClient | None = None
_secret: str | None = None


def get_database() -> Database:
    global _client
    if _client is None:
        if not config.MONGODB_URI:
            raise RuntimeError("Set MONGODB_URI to your MongoDB Atlas connection string.")
        options = {"serverSelectionTimeoutMS": 10000, "maxPoolSize": 10}
        if config.MONGODB_URI.startswith("mongodb+srv://"):
            options["tlsCAFile"] = certifi.where()  # reliable certificates on any host
        _client = MongoClient(config.MONGODB_URI, **options)
    return _client[config.MONGODB_DB]


def get_db() -> Database:
    """FastAPI dependency."""
    return get_database()


def object_id(value: str) -> ObjectId | None:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def ensure_indexes(db: Database) -> None:
    db.admin_users.create_index("username", unique=True)
    db.services.create_index("slug", unique=True)
    db.requests.create_index("tracking_id", unique=True)
    db.requests.create_index("pay_token", unique=True, sparse=True)  # only set once a link exists
    db.requests.create_index([("created_at", DESCENDING)])
    db.requests.create_index([("phone", ASCENDING)])
    db.requests.create_index([("service_slug", ASCENDING), ("status", ASCENDING)])


def get_secret_key() -> str:
    """Key used to sign admin login tokens."""
    global _secret
    if _secret:
        return _secret
    if config.SECRET_KEY_ENV:
        _secret = config.SECRET_KEY_ENV
        return _secret
    settings = get_database().settings
    for _ in range(3):  # two servers starting together may race to create it
        try:
            doc = settings.find_one_and_update(
                {"_id": "secret_key"},
                {"$setOnInsert": {"value": secrets.token_urlsafe(48)}},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            _secret = doc["value"]
            return _secret
        except DuplicateKeyError:
            continue
    raise RuntimeError("Could not create the signing key")
