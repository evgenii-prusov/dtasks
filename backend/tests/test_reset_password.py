from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest
from litestar.testing import AsyncTestClient

from conftest import DEFAULT_EMAIL
from conftest import DEFAULT_PASSWORD
from scripts.reset_password import reset_password  # noqa: E402

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
