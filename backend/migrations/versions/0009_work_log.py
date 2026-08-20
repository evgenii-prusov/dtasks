"""Work log: work_log_entries + work_log_links + work_log_days.

A daily engineering record aimed at review prep rather than at execution, so it
lives beside tasks instead of inside them. Three tables because the three things
have different lifetimes: an entry is the unit of work, its links are evidence
that only exist to be counted by kind ("4 PRs, 1 RFC"), and the day's sentiment
must be ratable whether or not that day has any entries -- hence work_log_days
is a sibling of work_log_entries, not its parent.

user_id is NOT NULL here. The nullable user_id on projects/habits is an artifact
of the pre-multitenancy backfill in 0002; a new table has no legacy rows.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-20
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "work_log_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("context", sa.Text(), nullable=False, server_default=""),
        sa.Column("impact", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_work_log_entries_user_id", "work_log_entries", ["user_id"])
    op.create_index("ix_work_log_entries_day", "work_log_entries", ["day"])
    op.create_index("ix_work_log_entries_task_id", "work_log_entries", ["task_id"])
    # Serves the range scan every entry list and every rollup bucket is built from.
    op.create_index("ix_work_log_entries_user_day", "work_log_entries", ["user_id", "day"])

    op.create_table(
        "work_log_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "entry_id",
            sa.Integer(),
            sa.ForeignKey("work_log_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="link"),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False, server_default=""),
    )
    op.create_index("ix_work_log_links_entry_id", "work_log_links", ["entry_id"])

    op.create_table(
        "work_log_days",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("energy", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("friction", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.UniqueConstraint("user_id", "day", name="uq_work_log_day"),
    )
    op.create_index("ix_work_log_days_user_id", "work_log_days", ["user_id"])
    op.create_index("ix_work_log_days_day", "work_log_days", ["day"])


def downgrade() -> None:
    op.drop_index("ix_work_log_days_day", table_name="work_log_days")
    op.drop_index("ix_work_log_days_user_id", table_name="work_log_days")
    op.drop_table("work_log_days")

    op.drop_index("ix_work_log_links_entry_id", table_name="work_log_links")
    op.drop_table("work_log_links")

    op.drop_index("ix_work_log_entries_user_day", table_name="work_log_entries")
    op.drop_index("ix_work_log_entries_task_id", table_name="work_log_entries")
    op.drop_index("ix_work_log_entries_day", table_name="work_log_entries")
    op.drop_index("ix_work_log_entries_user_id", table_name="work_log_entries")
    op.drop_table("work_log_entries")
