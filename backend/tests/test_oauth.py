from __future__ import annotations

import base64
import hashlib
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx
from conftest import DEFAULT_PASSWORD, TEST_INVITE_CODE
from litestar.testing import AsyncTestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app import oauth
from app.models import OAuthAccount, User

pytestmark = pytest.mark.anyio


def _parse_query(location: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(location).query).items()}


async def _start_login(
    client: AsyncTestClient, provider: str, invite_code: str | None = None
) -> httpx.Response:
    params = {"invite_code": invite_code} if invite_code is not None else {}
    resp = await client.get(f"/api/auth/oauth/{provider}/login", params=params, follow_redirects=False)
    assert resp.status_code == 302, resp.text
    return resp


def _mock_google(
    *, sub: str = "google-sub-1", email: str | None = "alice@example.com", email_verified: bool = True
) -> None:
    respx.post(oauth.GOOGLE_TOKEN_URL).mock(
        return_value=httpx.Response(200, json={"access_token": "fake-google-access-token"})
    )
    profile: dict[str, object] = {"sub": sub}
    if email is not None:
        profile["email"] = email
        profile["email_verified"] = email_verified
    respx.get(oauth.GOOGLE_USERINFO_URL).mock(return_value=httpx.Response(200, json=profile))


def _mock_github(*, github_id: int = 12345, emails: list[dict[str, object]] | None = None) -> None:
    if emails is None:
        emails = [{"email": "alice@example.com", "primary": True, "verified": True}]
    respx.post(oauth.GITHUB_TOKEN_URL).mock(
        return_value=httpx.Response(200, json={"access_token": "fake-github-access-token"})
    )
    respx.get(oauth.GITHUB_USER_URL).mock(return_value=httpx.Response(200, json={"id": github_id}))
    respx.get(oauth.GITHUB_EMAILS_URL).mock(return_value=httpx.Response(200, json=emails))


# --- /login ------------------------------------------------------------------


async def test_google_login_redirects_with_correct_authorize_params(anon_client: AsyncTestClient) -> None:
    resp = await _start_login(anon_client, "google", invite_code="some-invite")
    location = resp.headers["location"]
    assert location.startswith(oauth.GOOGLE_AUTHORIZE_URL)
    params = _parse_query(location)
    assert params["client_id"] == "test-google-client-id"
    assert params["redirect_uri"] == "http://localhost:5173/api/auth/oauth/google/callback"
    assert params["response_type"] == "code"
    assert params["scope"] == "openid email profile"
    assert params["code_challenge_method"] == "S256"
    assert "state" in params
    assert "code_challenge" in params


async def test_github_login_redirects_with_correct_authorize_params(anon_client: AsyncTestClient) -> None:
    resp = await _start_login(anon_client, "github")
    location = resp.headers["location"]
    assert location.startswith(oauth.GITHUB_AUTHORIZE_URL)
    params = _parse_query(location)
    assert params["client_id"] == "test-github-client-id"
    assert params["redirect_uri"] == "http://localhost:5173/api/auth/oauth/github/callback"
    assert params["scope"] == "read:user user:email"
    assert "state" in params
    assert "code_challenge" not in params


@respx.mock
async def test_google_pkce_verifier_matches_challenge_and_state_lands_in_session(
    anon_client: AsyncTestClient,
) -> None:
    login_resp = await _start_login(anon_client, "google", invite_code=TEST_INVITE_CODE)
    login_params = _parse_query(login_resp.headers["location"])
    state = login_params["state"]
    code_challenge = login_params["code_challenge"]

    captured_verifier: dict[str, str] = {}

    def _capture_token_request(request: httpx.Request) -> httpx.Response:
        form = dict(parse_qs(request.content.decode()))
        captured_verifier["code_verifier"] = form["code_verifier"][0]
        return httpx.Response(200, json={"access_token": "fake-google-access-token"})

    respx.post(oauth.GOOGLE_TOKEN_URL).mock(side_effect=_capture_token_request)
    respx.get(oauth.GOOGLE_USERINFO_URL).mock(
        return_value=httpx.Response(
            200, json={"sub": "google-sub-x", "email": "verifier@example.com", "email_verified": True}
        )
    )

    callback_resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert callback_resp.status_code == 302
    assert callback_resp.headers["location"] == "/"

    verifier = captured_verifier["code_verifier"]
    expected_challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=")
    assert expected_challenge.decode() == code_challenge


async def test_login_404s_for_unknown_provider(anon_client: AsyncTestClient) -> None:
    resp = await anon_client.get("/api/auth/oauth/facebook/login", follow_redirects=False)
    assert resp.status_code == 404


async def test_login_404s_when_provider_unconfigured(
    anon_client: AsyncTestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DTASKS_GOOGLE_CLIENT_SECRET", raising=False)
    resp = await anon_client.get("/api/auth/oauth/google/login", follow_redirects=False)
    assert resp.status_code == 404


# --- callback: state handling --------------------------------------------------


async def test_callback_404s_for_unknown_provider(anon_client: AsyncTestClient) -> None:
    resp = await anon_client.get(
        "/api/auth/oauth/facebook/callback",
        params={"code": "x", "state": "y"},
        follow_redirects=False,
    )
    assert resp.status_code == 404


async def test_callback_missing_state_redirects_state_mismatch(anon_client: AsyncTestClient) -> None:
    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code"},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/welcome?oauth_error=state_mismatch"


async def test_callback_wrong_state_redirects_state_mismatch(anon_client: AsyncTestClient) -> None:
    await _start_login(anon_client, "google")
    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": "not-the-real-state"},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/welcome?oauth_error=state_mismatch"


async def test_callback_expired_state_redirects_state_mismatch(
    anon_client: AsyncTestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(oauth, "OAUTH_STATE_MAX_AGE_SECONDS", -1)
    login_resp = await _start_login(anon_client, "google")
    state = _parse_query(login_resp.headers["location"])["state"]
    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/welcome?oauth_error=state_mismatch"


async def test_callback_state_is_single_use(anon_client: AsyncTestClient) -> None:
    login_resp = await _start_login(anon_client, "google", invite_code=TEST_INVITE_CODE)
    state = _parse_query(login_resp.headers["location"])["state"]

    with respx.mock:
        _mock_google(email="replay@example.com")
        first = await anon_client.get(
            "/api/auth/oauth/google/callback",
            params={"code": "test-code", "state": state},
            follow_redirects=False,
        )
        assert first.status_code == 302
        assert first.headers["location"] == "/"

    # Replaying the same state (e.g. a resubmitted callback URL) must fail: it was popped.
    second = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert second.status_code == 302
    assert second.headers["location"] == "/welcome?oauth_error=state_mismatch"


async def test_callback_provider_error_param_redirects_provider_error(
    anon_client: AsyncTestClient,
) -> None:
    login_resp = await _start_login(anon_client, "google")
    state = _parse_query(login_resp.headers["location"])["state"]
    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"error": "access_denied", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/welcome?oauth_error=provider_error"


@respx.mock
async def test_callback_unverified_email_redirects_no_verified_email(anon_client: AsyncTestClient) -> None:
    login_resp = await _start_login(anon_client, "google", invite_code=TEST_INVITE_CODE)
    state = _parse_query(login_resp.headers["location"])["state"]
    _mock_google(email="alice@example.com", email_verified=False)
    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/welcome?oauth_error=no_verified_email"


# --- callback: §2.5 decision tree ----------------------------------------------


@respx.mock
async def test_callback_existing_oauth_link_logs_in(
    anon_client: AsyncTestClient, db: async_sessionmaker
) -> None:
    async with db() as session:
        user = User(email="linked@example.com", password_hash=None)
        session.add(user)
        await session.flush()
        session.add(
            OAuthAccount(
                user_id=user.id,
                provider="google",
                provider_account_id="google-sub-linked",
                email="linked@example.com",
            )
        )
        await session.commit()
        user_id = user.id

    login_resp = await _start_login(anon_client, "google")
    state = _parse_query(login_resp.headers["location"])["state"]
    # Invite is irrelevant here (no invite was supplied) — existing identity always logs in.
    _mock_google(sub="google-sub-linked", email="linked@example.com")

    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/"

    me = await anon_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == user_id


@respx.mock
async def test_callback_verified_email_match_auto_links_without_duplicate_user(
    anon_client: AsyncTestClient, db: async_sessionmaker
) -> None:
    signup = await anon_client.post(
        "/api/auth/signup",
        json={"email": "existing@example.com", "password": DEFAULT_PASSWORD, "invite_code": TEST_INVITE_CODE},
    )
    assert signup.status_code == 201
    existing_user_id = signup.json()["id"]
    await anon_client.post("/api/auth/logout")

    login_resp = await _start_login(anon_client, "github")
    state = _parse_query(login_resp.headers["location"])["state"]
    _mock_github(
        github_id=99999, emails=[{"email": "existing@example.com", "primary": True, "verified": True}]
    )

    resp = await anon_client.get(
        "/api/auth/oauth/github/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/"

    me = await anon_client.get("/api/auth/me")
    assert me.json()["id"] == existing_user_id

    async with db() as session:
        users = (
            (await session.execute(select(User).where(User.email == "existing@example.com"))).scalars().all()
        )
        assert len(users) == 1
        links = (
            (await session.execute(select(OAuthAccount).where(OAuthAccount.user_id == existing_user_id)))
            .scalars()
            .all()
        )
        assert len(links) == 1
        assert links[0].provider == "github"
        assert links[0].provider_account_id == "99999"


@respx.mock
async def test_callback_new_user_with_valid_invite_is_created_seeded_and_logged_in(
    anon_client: AsyncTestClient,
) -> None:
    login_resp = await _start_login(anon_client, "google", invite_code=TEST_INVITE_CODE)
    state = _parse_query(login_resp.headers["location"])["state"]
    _mock_google(sub="google-sub-new", email="newperson@example.com")

    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/"

    me = await anon_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "newperson@example.com"

    projects = (await anon_client.get("/api/projects")).json()
    assert len(projects) == 6
    habits = (await anon_client.get("/api/habits")).json()
    assert len(habits) == 4


@respx.mock
async def test_callback_new_user_missing_invite_redirects_invite_required(
    anon_client: AsyncTestClient,
) -> None:
    login_resp = await _start_login(anon_client, "google")  # no invite_code
    state = _parse_query(login_resp.headers["location"])["state"]
    _mock_google(sub="google-sub-noinvite", email="noinvite@example.com")

    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/welcome?oauth_error=invite_required"


@respx.mock
async def test_callback_new_user_wrong_invite_redirects_invalid_invite(
    anon_client: AsyncTestClient,
) -> None:
    login_resp = await _start_login(anon_client, "google", invite_code="totally-wrong-code")
    state = _parse_query(login_resp.headers["location"])["state"]
    _mock_google(sub="google-sub-wronginvite", email="wronginvite@example.com")

    resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/welcome?oauth_error=invalid_invite"


# --- GitHub email selection -----------------------------------------------------


@respx.mock
async def test_github_primary_unverified_email_is_rejected(anon_client: AsyncTestClient) -> None:
    login_resp = await _start_login(anon_client, "github", invite_code=TEST_INVITE_CODE)
    state = _parse_query(login_resp.headers["location"])["state"]
    _mock_github(emails=[{"email": "primary@example.com", "primary": True, "verified": False}])

    resp = await anon_client.get(
        "/api/auth/oauth/github/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/welcome?oauth_error=no_verified_email"


@respx.mock
async def test_github_verified_primary_chosen_over_others(anon_client: AsyncTestClient) -> None:
    login_resp = await _start_login(anon_client, "github", invite_code=TEST_INVITE_CODE)
    state = _parse_query(login_resp.headers["location"])["state"]
    _mock_github(
        emails=[
            {"email": "secondary@example.com", "primary": False, "verified": True},
            {"email": "primary@example.com", "primary": True, "verified": True},
        ]
    )

    resp = await anon_client.get(
        "/api/auth/oauth/github/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/"

    me = await anon_client.get("/api/auth/me")
    assert me.json()["email"] == "primary@example.com"


# --- interaction with password login --------------------------------------------


@respx.mock
async def test_password_login_with_oauth_only_account_is_generic_401(anon_client: AsyncTestClient) -> None:
    login_resp = await _start_login(anon_client, "google", invite_code=TEST_INVITE_CODE)
    state = _parse_query(login_resp.headers["location"])["state"]
    _mock_google(sub="google-sub-oauthonly", email="oauthonly@example.com")
    callback_resp = await anon_client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "test-code", "state": state},
        follow_redirects=False,
    )
    assert callback_resp.headers["location"] == "/"
    await anon_client.post("/api/auth/logout")

    resp = await anon_client.post(
        "/api/auth/login", json={"email": "oauthonly@example.com", "password": "whatever-password"}
    )
    assert resp.status_code == 401

    unknown_email_resp = await anon_client.post(
        "/api/auth/login", json={"email": "nobody-at-all@example.com", "password": "whatever-password"}
    )
    assert unknown_email_resp.status_code == 401
    assert resp.json() == unknown_email_resp.json()


# --- /providers ------------------------------------------------------------------


async def test_providers_reflects_env_configuration(
    anon_client: AsyncTestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    resp = await anon_client.get("/api/auth/providers")
    assert resp.status_code == 200
    assert resp.json() == {"google": True, "github": True}

    monkeypatch.delenv("DTASKS_GITHUB_CLIENT_ID", raising=False)
    resp2 = await anon_client.get("/api/auth/providers")
    assert resp2.json() == {"google": True, "github": False}
