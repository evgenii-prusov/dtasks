"""Task completed_at: timestamp set when a task is marked complete.

Enables filtering completed tasks by date in the Today view, so
the "done" section only shows tasks finished today (not historically).

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-22
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("completed_at")
