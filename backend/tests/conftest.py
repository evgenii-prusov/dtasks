from __future__ import annotations

import base64
import hashlib
import os
import secrets
import tempfile
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from litestar.testing import AsyncTestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Auth config reads these at import time, so they must be set before the app import.
os.environ.setdefault("DTASKS_INVITE_CODE", "test-invite-code")
os.environ.setdefault("DTASKS_AUTH_RATE_LIMIT", "1000000")
os.environ.setdefault("DTASKS_SESSION_DIR", tempfile.mkdtemp(prefix="dtasks-test-sessions-"))
# OAuth provider creds default to "configured" so most tests don't need to think about
# them; tests exercising the "unconfigured provider" 404 path monkeypatch.delenv these.
os.environ.setdefault("DTASKS_GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("DTASKS_GOOGLE_CLIENT_SECRET", "test-google-client-secret")
os.environ.setdefault("DTASKS_GITHUB_CLIENT_ID", "test-github-client-id")
os.environ.setdefault("DTASKS_GITHUB_CLIENT_SECRET", "test-github-client-secret")
os.environ.setdefault("DTASKS_PUBLIC_URL", "http://localhost:5173")
# Tests have no migration step of their own; opt into the lifespan's create_all
# (prod instead runs `alembic upgrade head` before the app starts).
os.environ.setdefault("DTASKS_AUTO_CREATE_SCHEMA", "1")
os.environ.setdefault("DTASKS_MCP_ENABLED", "1")

from app import db as app_db  # noqa: E402
from app import main  # noqa: E402

TEST_INVITE_CODE = os.environ["DTASKS_INVITE_CODE"]
DEFAULT_EMAIL = "test@example.com"
DEFAULT_PASSWORD = "password123"

MakeClient = Callable[..., Awaitable[AsyncTestClient]]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def db(monkeypatch: pytest.MonkeyPatch, tmp_path) -> AsyncIterator[async_sessionmaker]:
    """Point the app at a throwaway SQLite file so tests never touch real data.

    The app reads ``app.db.engine`` / ``app.db.session_factory`` at call time,
    so patching them here makes the whole HTTP stack use the temp DB.
    """
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.sqlite'}")
    # Same per-connection pragmas the real engine gets. Without foreign_keys=ON,
    # SQLite silently ignores every ON DELETE clause, so DB-level CASCADE/SET NULL
    # would appear to work in tests and only differ in production.
    event.listens_for(engine.sync_engine, "connect")(app_db.set_sqlite_pragmas)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(app_db, "engine", engine)
    monkeypatch.setattr(app_db, "session_factory", session_factory)
    yield session_factory
    await engine.dispose()


async def signup(client: AsyncTestClient, email: str, password: str = DEFAULT_PASSWORD) -> None:
    resp = await client.post(
        "/api/auth/signup",
        json={"email": email, "password": password, "invite_code": TEST_INVITE_CODE},
    )
    assert resp.status_code == 201, resp.text


@pytest.fixture
async def anon_client(db: async_sessionmaker) -> AsyncIterator[AsyncTestClient]:
    """Client with no session; its lifespan creates tables on the temp DB."""
    async with AsyncTestClient(app=main.app) as client:
        yield client


@pytest.fixture
async def client(db: async_sessionmaker) -> AsyncIterator[AsyncTestClient]:
    """Client signed up as the default user, with starter data seeded at signup."""
    async with AsyncTestClient(app=main.app) as client:
        await signup(client, DEFAULT_EMAIL)
        yield client


@pytest.fixture
async def make_client(db: async_sessionmaker) -> AsyncIterator[MakeClient]:
    """Factory producing an authenticated client per email.

    Each user needs its own AsyncTestClient because the cookie jar is per client.
    However, Litestar's AsyncTestClient drives the ASGI app's lifespan (and every
    request) through a dedicated background-thread event loop ("blocking portal")
    owned by that client instance, and a single Litestar app object cannot have its
    lifespan entered concurrently from more than one such portal -- doing so hangs
    or raises "Attempted to exit cancel scope in a different task" errors, since the
    app's internal lifespan state is not reentrant. So only the first client created
    here actually enters/exits the app (owning startup and shutdown); every
    subsequent client reuses that first client's portal to run its requests on the
    same event loop, while still keeping its own independent cookie jar.
    """
    clients: list[AsyncTestClient] = []
    primary: AsyncTestClient | None = None

    async def _make(email: str, password: str = DEFAULT_PASSWORD) -> AsyncTestClient:
        nonlocal primary
        client = AsyncTestClient(app=main.app)
        if primary is None:
            await client.__aenter__()
            primary = client
        else:
            client.blocking_portal = primary.blocking_portal
        clients.append(client)
        await signup(client, email, password)
        return client

    yield _make
    if primary is not None:
        await primary.__aexit__(None, None, None)


# --- MCP connector (docs/mcp.md) -------------------------------------------

CLAUDE_REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback"


async def register_mcp_client(client: AsyncTestClient, redirect_uri: str = CLAUDE_REDIRECT_URI):
    return await client.post(
        "/register",
        json={"client_name": "Claude", "redirect_uris": [redirect_uri], "token_endpoint_auth_method": "none"},
    )


async def connect_claude(client: AsyncTestClient) -> dict[str, Any]:
    """Walk the OAuth flow the way claude.ai does, approving as ``client``'s user.

    Returns the token response plus ``client_id``, for refresh calls.
    """
    registration = (await register_mcp_client(client)).json()
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()

    authorize = await client.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": registration["client_id"],
            "redirect_uri": CLAUDE_REDIRECT_URI,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "xyz",
            "scope": "dtasks",
        },
        follow_redirects=False,
    )
    assert authorize.status_code == 302, authorize.text
    request_id = parse_qs(urlparse(authorize.headers["location"]).query)["request"][0]

    consent = await client.post(f"/api/mcp/authorizations/{request_id}", json={"approve": True})
    assert consent.status_code == 200, consent.text
    code = parse_qs(urlparse(consent.json()["redirect_url"]).query)["code"][0]

    token = await client.post(
        "/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": CLAUDE_REDIRECT_URI,
            "client_id": registration["client_id"],
            "code_verifier": verifier,
        },
    )
    assert token.status_code == 200, token.text
    return token.json() | {"client_id": registration["client_id"]}


async def refresh(client: AsyncTestClient, tokens: dict[str, Any], refresh_token: str | None = None):
    return await client.post(
        "/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token or tokens["refresh_token"],
            "client_id": tokens["client_id"],
        },
    )


async def mcp_call(client: AsyncTestClient, access_token: str, method: str, params: dict | None = None):
    """One JSON-RPC request to /mcp, as a stateless Streamable HTTP client sends it."""
    return await client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json, text/event-stream",
        },
    )
