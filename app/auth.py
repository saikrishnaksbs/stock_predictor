import datetime as dt
import logging

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Header, HTTPException

from app.config import settings

logger = logging.getLogger(__name__)

if settings.jwt_secret_key == "insecure-dev-secret-change-me":
    logger.warning(
        "JWT_SECRET_KEY is using the insecure default — set a real random "
        "secret via env var in any deployment that isn't purely local dev. "
        "Anyone who knows the default can forge valid login tokens."
    )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=settings.jwt_expire_minutes),
        "iat": dt.datetime.now(dt.timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_access_token(token: str) -> str:
    """Returns the user_id encoded in the token. Raises on any invalid/expired token."""
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    return payload["sub"]


def get_current_user_id(authorization: str = Header(default=None)) -> ObjectId:
    """FastAPI dependency: extracts and verifies the bearer token, returning
    the authenticated user's ObjectId. Every endpoint that uses this instead
    of trusting a client-supplied user_id can only ever act on the caller's
    own data — this is what actually closes the IDOR gap, not the login
    screen by itself."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        user_id = decode_access_token(token)
        return ObjectId(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired, please log in again")
    except (jwt.InvalidTokenError, InvalidId):
        raise HTTPException(401, "Invalid session token")
