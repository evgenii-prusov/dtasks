"""OAuth 2.1 authorization server for the MCP connector (docs/mcp.md §3).

The MCP SDK owns the protocol (metadata, DCR, /authorize, /token, /revoke,
bearer checks); this module is the storage behind it plus the two session-auth
endpoints the SPA consent page calls. Every grant belongs to one dtasks user,
and the access token's ``subject`` is that user's id.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import time
from datetime import UTC, datetime

import msgspec
from litestar import Router, get, post
from litestar import delete as delete_route
from litestar.exceptions import NotFoundException
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    RefreshToken,
    RegistrationError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from . import db
from .models import McpAuthRequest, McpClient, McpGrant, McpToken, User

SCOPE = "dtasks"
ACCESS_TOKEN_TTL = 60 * 60  # 1 hour
REFRESH_TOKEN_TTL = 60 * 60 * 24 * 90  # 90 days
AUTH_REQUEST_TTL = 60 * 10  # time to click Allow, then to redeem the code
DEFAULT_REDIRECT_ALLOWLIST = (
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
)


def public_url() -> str:
    return os.environ.get("DTASKS_PUBLIC_URL", "http://localhost:5173").rstrip("/")


def resource_url() -> str:
    return f"{public_url()}/mcp"


def redirect_allowlist() -> set[str]:
    raw = os.environ.get("DTASKS_MCP_REDIRECT_ALLOWLIST", "")
    entries = [u.strip() for u in raw.split(",") if u.strip()]
    return set(entries or DEFAULT_REDIRECT_ALLOWLIST)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _issue_tokens(session: AsyncSession, grant_id: int) -> OAuthToken:
    access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    now = int(time.time())
    # Housekeeping: rotated refresh tokens are kept for replay detection only
    # until they would have expired anyway.
    await session.execute(delete(McpToken).where(McpToken.grant_id == grant_id, McpToken.expires_at < now))
    session.add_all(
        [
            McpToken(
                token_hash=_hash(access), grant_id=grant_id, kind="access", expires_at=now + ACCESS_TOKEN_TTL
            ),
            McpToken(
                token_hash=_hash(refresh),
                grant_id=grant_id,
                kind="refresh",
                expires_at=now + REFRESH_TOKEN_TTL,
            ),
        ]
    )
    await session.commit()
    return OAuthToken(
        access_token=access,
        token_type="Bearer",
        expires_in=ACCESS_TOKEN_TTL,
        scope=SCOPE,
        refresh_token=refresh,
    )


async def _revoke_grant(session: AsyncSession, grant_id: int) -> None:
    await session.execute(
        update(McpGrant)
        .where(McpGrant.id == grant_id, McpGrant.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await session.execute(delete(McpToken).where(McpToken.grant_id == grant_id))
    await session.commit()


async def _live_token(session: AsyncSession, token: str, kind: str) -> tuple[McpToken, McpGrant] | None:
    row = (
        await session.execute(
            select(McpToken, McpGrant)
            .join(McpGrant, McpToken.grant_id == McpGrant.id)
            .where(McpToken.token_hash == _hash(token), McpToken.kind == kind, McpGrant.revoked_at.is_(None))
        )
    ).first()
    if row is None or row[0].expires_at < time.time():
        return None
    return row[0], row[1]


class DtasksAuthProvider:
    """``OAuthAuthorizationServerProvider`` backed by the dtasks database."""

    # --- clients (§3.2) ---------------------------------------------------

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        async with db.session_factory() as session:
            client = await session.get(McpClient, client_id)
        return OAuthClientInformationFull.model_validate_json(client.info) if client else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        allowed = redirect_allowlist()
        if any(str(uri) not in allowed for uri in client_info.redirect_uris or []):
            raise RegistrationError(
                error="invalid_redirect_uri",
                error_description="redirect_uri is not an allowed MCP client callback",
            )
        async with db.session_factory() as session:
            session.add(McpClient(client_id=client_info.client_id, info=client_info.model_dump_json()))
            await session.commit()

    # --- authorization codes (§3.3) ---------------------------------------

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        request_id = secrets.token_urlsafe(24)
        async with db.session_factory() as session:
            # Housekeeping: abandoned consent screens and unredeemed codes.
            await session.execute(delete(McpAuthRequest).where(McpAuthRequest.expires_at < time.time()))
            session.add(
                McpAuthRequest(
                    id=request_id,
                    client_id=client.client_id,
                    params=params.model_dump_json(),
                    expires_at=int(time.time()) + AUTH_REQUEST_TTL,
                )
            )
            await session.commit()
        return f"{public_url()}/oauth/consent?request={request_id}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        async with db.session_factory() as session:
            row = (
                await session.execute(
                    select(McpAuthRequest, McpGrant)
                    .join(McpGrant, McpAuthRequest.grant_id == McpGrant.id)
                    .where(
                        McpAuthRequest.code_hash == _hash(authorization_code),
                        McpAuthRequest.client_id == client.client_id,
                    )
                )
            ).first()
        if row is None:
            return None
        auth_request, grant = row
        params = AuthorizationParams.model_validate_json(auth_request.params)
        return AuthorizationCode(
            code=authorization_code,
            scopes=params.scopes or [SCOPE],
            expires_at=auth_request.expires_at,
            client_id=client.client_id,
            code_challenge=params.code_challenge,
            redirect_uri=params.redirect_uri,
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            resource=params.resource,
            subject=str(grant.user_id),
        )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        async with db.session_factory() as session:
            auth_request = (
                await session.execute(
                    select(McpAuthRequest).where(McpAuthRequest.code_hash == _hash(authorization_code.code))
                )
            ).scalar_one()
            grant_id = auth_request.grant_id
            assert grant_id is not None
            await session.delete(auth_request)  # codes are single-use
            return await _issue_tokens(session, grant_id)

    # --- refresh tokens (§3.4) --------------------------------------------

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        async with db.session_factory() as session:
            live = await _live_token(session, refresh_token, "refresh")
            if live is None or live[1].client_id != client.client_id:
                return None
            token, grant = live
            if token.rotated:
                # A rotated token coming back means it leaked: kill the whole grant.
                await _revoke_grant(session, grant.id)
                return None
        return RefreshToken(
            token=refresh_token,
            client_id=client.client_id,
            scopes=[SCOPE],
            expires_at=token.expires_at,
            resource=resource_url(),
            subject=str(grant.user_id),
        )

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        async with db.session_factory() as session:
            token = await session.get(McpToken, _hash(refresh_token.token))
            assert token is not None
            token.rotated = True
            return await _issue_tokens(session, token.grant_id)

    # --- access tokens ----------------------------------------------------

    async def load_access_token(self, token: str) -> AccessToken | None:
        async with db.session_factory() as session:
            live = await _live_token(session, token, "access")
            if live is None:
                return None
            row, grant = live
            grant.last_used_at = datetime.now(UTC)
            await session.commit()
        return AccessToken(
            token=token,
            client_id=grant.client_id,
            scopes=[SCOPE],
            expires_at=row.expires_at,
            resource=resource_url(),
            subject=str(grant.user_id),
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        async with db.session_factory() as session:
            row = await session.get(McpToken, _hash(token.token))
            if row is not None:
                await _revoke_grant(session, row.grant_id)


# --- consent API for the SPA (§3.3) ---------------------------------------


class AuthRequestOut(msgspec.Struct):
    client_name: str


class ConsentPayload(msgspec.Struct):
    approve: bool


class ConsentOut(msgspec.Struct):
    redirect_url: str


async def _pending(session: AsyncSession, request_id: str) -> tuple[McpAuthRequest, McpClient]:
    row = (
        await session.execute(
            select(McpAuthRequest, McpClient)
            .join(McpClient, McpAuthRequest.client_id == McpClient.client_id)
            .where(
                McpAuthRequest.id == request_id,
                McpAuthRequest.code_hash.is_(None),
                McpAuthRequest.expires_at >= int(time.time()),
            )
        )
    ).first()
    if row is None:
        raise NotFoundException(detail="Authorization request not found or expired")
    return row[0], row[1]


def _client_name(client: McpClient) -> str:
    info = OAuthClientInformationFull.model_validate_json(client.info)
    return info.client_name or "An MCP client"


@get("/authorizations/{request_id:str}")
async def get_authorization(request_id: str, session: AsyncSession) -> AuthRequestOut:
    _, client = await _pending(session, request_id)
    return AuthRequestOut(client_name=_client_name(client))


@post("/authorizations/{request_id:str}", status_code=200)
async def decide_authorization(
    request_id: str, data: ConsentPayload, session: AsyncSession, user: User
) -> ConsentOut:
    auth_request, _ = await _pending(session, request_id)
    params = AuthorizationParams.model_validate_json(auth_request.params)
    redirect_uri = str(params.redirect_uri)

    if not data.approve:
        await session.delete(auth_request)
        await session.commit()
        return ConsentOut(construct_redirect_uri(redirect_uri, error="access_denied", state=params.state))

    grant = McpGrant(user_id=user.id, client_id=auth_request.client_id)
    session.add(grant)
    await session.flush()
    code = secrets.token_urlsafe(32)
    auth_request.grant_id = grant.id
    auth_request.code_hash = _hash(code)
    auth_request.expires_at = int(time.time()) + AUTH_REQUEST_TTL
    await session.commit()
    return ConsentOut(construct_redirect_uri(redirect_uri, code=code, state=params.state))


# --- connected apps (§3.5) -------------------------------------------------


class GrantOut(msgspec.Struct):
    id: int
    client_name: str
    created_at: datetime
    last_used_at: datetime | None


@get("/grants")
async def list_grants(session: AsyncSession, user: User) -> list[GrantOut]:
    rows = await session.execute(
        select(McpGrant, McpClient)
        .join(McpClient, McpGrant.client_id == McpClient.client_id)
        .where(McpGrant.user_id == user.id, McpGrant.revoked_at.is_(None))
        .order_by(McpGrant.created_at.desc())
    )
    return [
        GrantOut(
            id=grant.id,
            client_name=_client_name(client),
            created_at=grant.created_at,
            last_used_at=grant.last_used_at,
        )
        for grant, client in rows.all()
    ]


@delete_route("/grants/{grant_id:int}", status_code=204)
async def revoke_grant(grant_id: int, session: AsyncSession, user: User) -> None:
    grant = await session.get(McpGrant, grant_id)
    if grant is None or grant.user_id != user.id or grant.revoked_at is not None:
        raise NotFoundException(detail="Connected app not found")
    await _revoke_grant(session, grant.id)


# Session-auth endpoints the SPA calls. Mounted even with the connector disabled:
# with no OAuth routes there is nothing to consent to, and the Connected apps
# page should still load (empty) rather than 404.
mcp_consent_router = Router(
    path="/api/mcp",
    route_handlers=[get_authorization, decide_authorization, list_grants, revoke_grant],
)
