"""MCP connector: OAuth flow and tools, end to end through the HTTP stack (docs/mcp.md §6)."""

from __future__ import annotations

import pytest
from conftest import MakeClient, call_tool, connect_claude, mcp_call, refresh, register_mcp_client
from litestar.testing import AsyncTestClient

pytestmark = pytest.mark.anyio


async def test_claude_connects_calls_mcp_and_refreshes(client: AsyncTestClient) -> None:
    # Claude discovers the auth server from the 401 on its first, tokenless call.
    anonymous = await mcp_call(client, "", "tools/list")
    assert anonymous.status_code == 401
    assert "/.well-known/oauth-protected-resource/mcp" in anonymous.headers["www-authenticate"]

    tokens = await connect_claude(client)
    assert "tasks" in await call_tool(client, tokens["access_token"], "get_today")

    refreshed = await refresh(client, tokens)
    assert refreshed.status_code == 200, refreshed.text
    assert "tasks" in await call_tool(client, refreshed.json()["access_token"], "get_today")


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


async def test_revoking_a_connected_app_cuts_off_its_tokens(client: AsyncTestClient) -> None:
    tokens = await connect_claude(client)
    [app] = (await client.get("/api/mcp/grants")).json()
    assert app["client_name"] == "Claude"

    assert (await client.delete(f"/api/mcp/grants/{app['id']}")).status_code == 204
    assert (await client.get("/api/mcp/grants")).json() == []
    assert (await mcp_call(client, tokens["access_token"], "tools/list")).status_code == 401
    assert (await refresh(client, tokens)).status_code == 400


async def test_a_token_only_reaches_its_own_users_tasks(make_client: MakeClient) -> None:
    alice, bob = await make_client("alice@example.com"), await make_client("bob@example.com")
    alice_token = (await connect_claude(alice))["access_token"]
    bob_token = (await connect_claude(bob))["access_token"]
    secret = await call_tool(alice, alice_token, "add_task", title="Alice's secret")

    assert await call_tool(bob, bob_token, "search_tasks", query="secret") == []
    assert "not found" in await call_tool(bob, bob_token, "complete_task", task_id=secret["id"])


async def test_task_workflow_shows_up_on_today(client: AsyncTestClient) -> None:
    token = (await connect_claude(client))["access_token"]

    task = await call_tool(
        client, token, "add_task", title="Read the Rust book", project="personal", green=True
    )
    assert (task["project"], task["plan"], task["green"]) == ("Personal", "backlog", True)

    task = await call_tool(
        client, token, "update_task", task_id=task["id"], title="Read Rust, ch. 1", plan="today"
    )
    await call_tool(client, token, "complete_task", task_id=task["id"])

    today = await call_tool(client, token, "get_today")
    [on_today] = [t for t in today["tasks"] if t["id"] == task["id"]]
    assert (on_today["title"], on_today["completed"]) == ("Read Rust, ch. 1", True)


async def test_habits_and_work_log(client: AsyncTestClient) -> None:
    token = (await connect_claude(client))["access_token"]

    await call_tool(client, token, "log_habit", habit="read a book", state="minimal")
    today = await call_tool(client, token, "get_today")
    assert {"name": "Read a book", "state": "minimal"} in today["habits"]

    await call_tool(client, token, "add_worklog_entry", title="Shipped MCP tools", category="shipped")
    assert [e["title"] for e in await call_tool(client, token, "get_worklog")] == ["Shipped MCP tools"]
