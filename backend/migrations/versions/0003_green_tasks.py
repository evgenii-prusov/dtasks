"""Green tasks: is_green flag on tasks.

A "green task" (from Maxim Dorofeev's Jedi techniques) is a task that moves
the user toward their own goals and dreams, as opposed to reactive work.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-05
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(
            sa.Column("is_green", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("is_green")
