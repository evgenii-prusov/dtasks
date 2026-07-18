from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest
from conftest import DEFAULT_EMAIL, DEFAULT_PASSWORD
from litestar.testing import AsyncTestClient
from scripts.reset_password import reset_password  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import User

pytestmark = pytest.mark.anyio

NEW_PASSWORD = "new-password-456"


async def test_reset_password_updates_hash(client: AsyncTestClient) -> None:
    found = await reset_password(DEFAULT_EMAIL, NEW_PASSWORD)
    assert found is True

    old_login = await client.post(
        "/api/auth/login",
        json={"email": DEFAULT_EMAIL, "password": DEFAULT_PASSWORD},
    )
    assert old_login.status_code == 401

    new_login = await client.post(
        "/api/auth/login",
        json={"email": DEFAULT_EMAIL, "password": NEW_PASSWORD},
    )
    assert new_login.status_code == 200


async def test_reset_password_unknown_email_returns_false(anon_client: AsyncTestClient) -> None:
    # anon_client's lifespan creates the tables on the temp DB; no user signed up.
    found = await reset_password("nobody@example.com", "whatever-password")
    assert found is False


async def test_reset_password_gives_oauth_only_account_a_working_password(
    anon_client: AsyncTestClient, db: async_sessionmaker
) -> None:
    """OAuth-only users (password_hash=None) can be given a password manually."""
    oauth_email = "oauth-only@example.com"
    async with db() as session:
        session.add(User(email=oauth_email, password_hash=None))
        await session.commit()

    found = await reset_password(oauth_email, NEW_PASSWORD)
    assert found is True

    login = await anon_client.post(
        "/api/auth/login",
        json={"email": oauth_email, "password": NEW_PASSWORD},
    )
    assert login.status_code == 200
