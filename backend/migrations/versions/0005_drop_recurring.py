"""Drop recurring column from tasks.

The recurring flag was a display-only label with no scheduling logic behind
it — no background job ever auto-created tasks based on it. Removing it to
avoid misleading users about its behaviour.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-22
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("recurring")


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("recurring", sa.Boolean(), nullable=False, server_default="0"))
