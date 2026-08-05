"""Feature-usage analytics: append-only events table.

Records what the user did, not what the data looks like. Rows are only ever
inserted, so `id` works as a monotonic cursor for incremental reads and
`event_id` as the dedup key for retried batches.

`input` (keyboard/mouse/touch/pen/unknown) is a column rather than a `props`
key because every migration-tracking query filters on it.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-05
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("session_id", sa.String(length=36), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("input", sa.String(length=10), nullable=False, server_default="unknown"),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("surface", sa.String(length=20), nullable=True),
        sa.Column("props", sa.Text(), nullable=True),
        sa.Column("app_version", sa.String(length=40), nullable=True),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_events_event_id", "events", ["event_id"], unique=True)
    op.create_index("ix_events_user_id", "events", ["user_id"])
    op.create_index("ix_events_user_received", "events", ["user_id", "received_at"])
    op.create_index("ix_events_name_received", "events", ["name", "received_at"])
    # Serves the mouse-vs-keyboard trend, which slices by user and modality over time.
    op.create_index("ix_events_user_input_received", "events", ["user_id", "input", "received_at"])


def downgrade() -> None:
    op.drop_index("ix_events_user_input_received", table_name="events")
    op.drop_index("ix_events_name_received", table_name="events")
    op.drop_index("ix_events_user_received", table_name="events")
    op.drop_index("ix_events_user_id", table_name="events")
    op.drop_index("ix_events_event_id", table_name="events")
    op.drop_table("events")
