"""MCP connector: OAuth flow and tools, end to end through the HTTP stack (docs/mcp.md §6)."""

from __future__ import annotations

import pytest
from conftest import connect_claude, mcp_call, refresh, register_mcp_client
from litestar.testing import AsyncTestClient

pytestmark = pytest.mark.anyio


async def test_claude_connects_calls_mcp_and_refreshes(client: AsyncTestClient) -> None:
    # Claude discovers the auth server from the 401 on its first, tokenless call.
    anonymous = await mcp_call(client, "", "tools/list")
    assert anonymous.status_code == 401
    assert "/.well-known/oauth-protected-resource/mcp" in anonymous.headers["www-authenticate"]

    tokens = await connect_claude(client)
    assert "result" in (await mcp_call(client, tokens["access_token"], "tools/list")).json()

    refreshed = await refresh(client, tokens)
    assert refreshed.status_code == 200, refreshed.text
    assert "result" in (await mcp_call(client, refreshed.json()["access_token"], "tools/list")).json()


async def test_registration_rejects_redirect_uri_not_on_allowlist(client: AsyncTestClient) -> None:
    resp = await register_mcp_client(client, redirect_uri="https://evil.example/callback")
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_redirect_uri"


async def test_reused_refresh_token_revokes_the_grant(client: AsyncTestClient) -> None:
    tokens = await connect_claude(client)
    rotated = (await refresh(client, tokens)).json()

    replay = await refresh(client, tokens)
    assert replay.status_code == 400

    # The replay killed the grant, so the tokens rotation handed out are dead too.
    assert (await refresh(client, tokens, rotated["refresh_token"])).status_code == 400
    assert (await mcp_call(client, rotated["access_token"], "tools/list")).status_code == 401


async def test_revoked_token_is_rejected(client: AsyncTestClient) -> None:
    tokens = await connect_claude(client)
    resp = await client.post(
        "/revoke",
        # The SDK's form model requires the field even for public clients.
        data={"token": tokens["access_token"], "client_id": tokens["client_id"], "client_secret": ""},
    )
    assert resp.status_code == 200, resp.text
    assert (await mcp_call(client, tokens["access_token"], "tools/list")).status_code == 401
