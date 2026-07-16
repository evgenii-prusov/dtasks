from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from litestar import Request, Router, get, post
from litestar.connection import ASGIConnection
from litestar.exceptions import (
    ClientException,
    NotAuthorizedException,
    PermissionDeniedException,
)
from litestar.middleware.rate_limit import RateLimitConfig
from litestar.middleware.session.server_side import (
    ServerSideSessionBackend,
    ServerSideSessionConfig,
)
from litestar.security.session_auth import SessionAuth
from litestar.stores.file import FileStore
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import db
from .models import User
from .schemas import LoginPayload, SignupPayload, UserOut
from .seed import seed_starter_data

MIN_PASSWORD_LENGTH = 8
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

_hasher = PasswordHasher()
# Verified for unknown emails so login timing doesn't reveal whether an account exists.
_DUMMY_HASH = _hasher.hash("dtasks-dummy-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _user_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email)


async def retrieve_user_handler(session: dict[str, Any], connection: ASGIConnection) -> User | None:
    user_id = session.get("user_id")
    if user_id is None:
        return None
    async with db.session_factory() as db_session:
        return await db_session.get(User, user_id)


@post("/signup", exclude_from_auth=True, status_code=201)
async def signup(data: SignupPayload, session: AsyncSession, request: Request) -> UserOut:
    expected = os.environ.get("DTASKS_INVITE_CODE", "")
    if not expected or not secrets.compare_digest(data.invite_code, expected):
        raise PermissionDeniedException(detail="Invalid invite code")

    email = data.email.strip().lower()
    if "@" not in email:
        raise ClientException(detail="A valid email is required")
    if len(data.password) < MIN_PASSWORD_LENGTH:
        raise ClientException(detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

    exists = (await session.execute(select(User.id).where(User.email == email))).first()
    if exists is not None:
        raise ClientException(detail="An account with this email already exists", status_code=409)

    user = User(email=email, password_hash=hash_password(data.password))
    session.add(user)
    await session.flush()
    await seed_starter_data(session, user.id)
    await session.commit()

    request.set_session({"user_id": user.id})
    return _user_out(user)


@post("/login", exclude_from_auth=True, status_code=200)
async def login(data: LoginPayload, session: AsyncSession, request: Request) -> UserOut:
    email = data.email.strip().lower()
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    password_ok = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not password_ok:
        raise NotAuthorizedException(detail="Invalid email or password")
    request.set_session({"user_id": user.id})
    return _user_out(user)


@post("/logout", status_code=204)
async def logout(request: Request) -> None:
    request.clear_session()


@get("/me")
async def me(request: Request[User, Any, Any]) -> UserOut:
    return _user_out(request.user)


# Brute-force protection for credential endpoints only; /me is polled by the SPA.
_rate_limit = RateLimitConfig(rate_limit=("minute", int(os.environ.get("DTASKS_AUTH_RATE_LIMIT", "20"))))

auth_router = Router(
    path="/api/auth",
    route_handlers=[
        Router(path="/", route_handlers=[signup, login], middleware=[_rate_limit.middleware]),
        logout,
        me,
    ],
)


def session_store() -> FileStore:
    session_dir = os.environ.get("DTASKS_SESSION_DIR", str(db.DB_PATH.parent / ".sessions"))
    return FileStore(path=Path(session_dir))


session_auth = SessionAuth[User, ServerSideSessionBackend](
    retrieve_user_handler=retrieve_user_handler,
    session_backend_config=ServerSideSessionConfig(
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("DTASKS_SECURE_COOKIES") == "1",
    ),
    # Everything outside /api (static files, SPA fallback routes, /schema) is public;
    # signup/login opt out per-handler via exclude_from_auth.
    exclude=["^/(?!api(?:/|$))"],
)
