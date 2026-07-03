"""Multitenancy: users table + user_id on the tenant-root tables.

user_id is nullable at the DB level so this migration can run against a
database with pre-multitenancy rows; the backfill (scripts/create_owner.py)
assigns those rows to the owner account. The application always sets user_id.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-03
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_projects_user_id", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_index("ix_projects_user_id", ["user_id"])
    with op.batch_alter_table("habits") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_habits_user_id", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_index("ix_habits_user_id", ["user_id"])


def downgrade() -> None:
    with op.batch_alter_table("habits") as batch_op:
        batch_op.drop_index("ix_habits_user_id")
        batch_op.drop_constraint("fk_habits_user_id", type_="foreignkey")
        batch_op.drop_column("user_id")
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_index("ix_projects_user_id")
        batch_op.drop_constraint("fk_projects_user_id", type_="foreignkey")
        batch_op.drop_column("user_id")
    op.drop_table("users")
