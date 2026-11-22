"""The MCP connector endpoint and its OAuth routes, mounted into Litestar (docs/mcp.md §2).

The MCP SDK builds a Starlette app that serves ``/mcp`` plus the OAuth
metadata, ``/register``, ``/authorize``, ``/token`` and ``/revoke``. Litestar's
CLI needs a ``Litestar`` instance as the app, so rather than wrapping Litestar
we forward each of those exact paths to the Starlette app via ``asgi`` handlers.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from litestar import Router, asgi
from litestar.types import Receive, Scope, Send
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette

from .auth import auth_rate_limit
from .mcp_auth import SCOPE, DtasksAuthProvider, mcp_consent_router, public_url, resource_url


def mcp_enabled() -> bool:
    return os.environ.get("DTASKS_MCP_ENABLED") == "1"


server = MCPServer(
    name="dtasks",
    instructions="Tasks, plans, habits and work log from the user's dtasks account.",
    auth_server_provider=DtasksAuthProvider(),
    auth=AuthSettings(
        issuer_url=public_url(),
        resource_server_url=resource_url(),
        validate_token_resource=True,
        required_scopes=[SCOPE],
        client_registration_options=ClientRegistrationOptions(
            enabled=True, valid_scopes=[SCOPE], default_scopes=[SCOPE]
        ),
        revocation_options=RevocationOptions(enabled=True),
    ),
)

# Built per lifespan: the SDK's session manager can be started only once per
# instance, and tests start the app many times.
_starlette_app: Starlette | None = None


@asynccontextmanager
async def running() -> AsyncIterator[None]:
    """Run inside the Litestar lifespan; the Starlette app's own lifespan never fires."""
    global _starlette_app
    _starlette_app = server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        # DNS-rebinding protection is for servers on localhost; this one is public,
        # behind Caddy, and every request carries a bearer token.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    async with server.session_manager.run():
        yield
    _starlette_app = None


async def _forward(scope: Scope, receive: Receive, send: Send) -> None:
    assert _starlette_app is not None, "MCP routes used outside the app lifespan"
    await _starlette_app(scope, receive, send)  # type: ignore[arg-type]


def _route(path: str, rate_limited: bool = False):
    handler = asgi(path, copy_scope=True, name=f"mcp:{path}")(_forward)
    if rate_limited:
        return Router(path="/", route_handlers=[handler], middleware=[auth_rate_limit.middleware])
    return handler


mcp_route_handlers = [
    _route("/mcp"),
    _route("/.well-known/oauth-authorization-server"),
    _route("/.well-known/oauth-protected-resource/mcp"),
    _route("/register", rate_limited=True),
    _route("/authorize", rate_limited=True),
    _route("/token", rate_limited=True),
    _route("/revoke", rate_limited=True),
    mcp_consent_router,
]
