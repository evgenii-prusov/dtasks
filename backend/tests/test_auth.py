from __future__ import annotations

import os

import pytest
from conftest import DEFAULT_EMAIL, DEFAULT_PASSWORD
from litestar.testing import AsyncTestClient

pytestmark = pytest.mark.anyio

INVITE = os.environ["DTASKS_INVITE_CODE"]


async def test_anonymous_api_request_gets_401(anon_client: AsyncTestClient) -> None:
    resp = await anon_client.get("/api/projects")
    assert resp.status_code == 401


async def test_signup_creates_account_with_starter_data(anon_client: AsyncTestClient) -> None:
    resp = await anon_client.post(
        "/api/auth/signup",
        json={"email": " Alice@Example.com ", "password": "password123", "invite_code": INVITE},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "alice@example.com"
    assert isinstance(body["id"], int)

    me = await anon_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "alice@example.com"

    projects = (await anon_client.get("/api/projects")).json()
    assert len(projects) == 6
    habits = (await anon_client.get("/api/habits")).json()
    assert len(habits) == 4


async def test_signup_rejects_wrong_invite_code(anon_client: AsyncTestClient) -> None:
    resp = await anon_client.post(
        "/api/auth/signup",
        json={"email": "x@y.com", "password": "password123", "invite_code": "wrong-code"},
    )
    assert resp.status_code == 403
    # No session was created.
    assert (await anon_client.get("/api/auth/me")).status_code == 401


async def test_signup_rejects_duplicate_email_case_insensitive(
    anon_client: AsyncTestClient,
) -> None:
    first = await anon_client.post(
        "/api/auth/signup",
        json={"email": "foo@x.com", "password": "password123", "invite_code": INVITE},
    )
    assert first.status_code == 201
    second = await anon_client.post(
        "/api/auth/signup",
        json={"email": "FOO@X.COM", "password": "password456", "invite_code": INVITE},
    )
    assert second.status_code == 409


async def test_signup_rejects_short_password(anon_client: AsyncTestClient) -> None:
    resp = await anon_client.post(
        "/api/auth/signup",
        json={"email": "short@x.com", "password": "1234567", "invite_code": INVITE},
    )
    assert resp.status_code == 400


async def test_login_logout_roundtrip(client: AsyncTestClient) -> None:
    assert (await client.get("/api/auth/me")).status_code == 200

    assert (await client.post("/api/auth/logout")).status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401

    resp = await client.post("/api/auth/login", json={"email": DEFAULT_EMAIL, "password": DEFAULT_PASSWORD})
    assert resp.status_code == 200
    assert resp.json()["email"] == DEFAULT_EMAIL
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_login_failures_are_indistinguishable(client: AsyncTestClient) -> None:
    await client.post("/api/auth/logout")

    wrong_password = await client.post(
        "/api/auth/login", json={"email": DEFAULT_EMAIL, "password": "wrong-password"}
    )
    unknown_email = await client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": DEFAULT_PASSWORD}
    )
    assert wrong_password.status_code == 401
    assert unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


async def test_spa_routes_stay_public(anon_client: AsyncTestClient) -> None:
    # 404 (no built dist in test env) or 200 (dist present) — but never an auth rejection.
    resp = await anon_client.get("/plan")
    assert resp.status_code != 401
