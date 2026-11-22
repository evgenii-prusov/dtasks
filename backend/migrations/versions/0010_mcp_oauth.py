"""MCP connector OAuth server: mcp_clients, mcp_grants, mcp_auth_requests, mcp_tokens.

dtasks acts as its own OAuth 2.1 authorization server for Claude's MCP
connector (docs/mcp.md §3). Tokens are stored as SHA-256 hashes only.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-22
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_clients",
        sa.Column("client_id", sa.String(length=64), primary_key=True),
        sa.Column("info", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "mcp_grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "client_id",
            sa.String(length=64),
            sa.ForeignKey("mcp_clients.client_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_mcp_grants_user_id", "mcp_grants", ["user_id"])
    op.create_table(
        "mcp_auth_requests",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "client_id",
            sa.String(length=64),
            sa.ForeignKey("mcp_clients.client_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("params", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
        sa.Column("grant_id", sa.Integer(), sa.ForeignKey("mcp_grants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("code_hash", sa.String(length=64), nullable=True, unique=True),
    )
    op.create_table(
        "mcp_tokens",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column("grant_id", sa.Integer(), sa.ForeignKey("mcp_grants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
        sa.Column("rotated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_mcp_tokens_grant_id", "mcp_tokens", ["grant_id"])


def downgrade() -> None:
    op.drop_table("mcp_tokens")
    op.drop_table("mcp_auth_requests")
    op.drop_table("mcp_grants")
    op.drop_table("mcp_clients")
