"""Recurring tasks: recurrence_rules table + Task.recurrence_rule_id/occurrence_date.

A RecurrenceRule is a weekday-based template; each occurrence it spawns is an
ordinary Task row tagged with (recurrence_rule_id, occurrence_date), lazily
materialized on GET /api/projects. This replaces the earlier plain `recurring`
boolean (dropped in 0005) which had no generation logic behind it.

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-23
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recurrence_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column(
            "project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("complexity", sa.String(length=10), nullable=False, server_default="low"),
        sa.Column("is_green", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("weekdays", sa.Integer(), nullable=False),
        sa.Column("last_generated_date", sa.Date(), nullable=True),
    )
    op.create_index("ix_recurrence_rules_user_id", "recurrence_rules", ["user_id"])

    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("recurrence_rule_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("occurrence_date", sa.Date(), nullable=True))
        batch_op.create_foreign_key(
            "fk_tasks_recurrence_rule_id",
            "recurrence_rules",
            ["recurrence_rule_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_tasks_recurrence_rule_id", ["recurrence_rule_id"])
        batch_op.create_unique_constraint(
            "uq_recurrence_occurrence_day", ["recurrence_rule_id", "occurrence_date"]
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("uq_recurrence_occurrence_day", type_="unique")
        batch_op.drop_index("ix_tasks_recurrence_rule_id")
        batch_op.drop_constraint("fk_tasks_recurrence_rule_id", type_="foreignkey")
        batch_op.drop_column("occurrence_date")
        batch_op.drop_column("recurrence_rule_id")

    op.drop_index("ix_recurrence_rules_user_id", table_name="recurrence_rules")
    op.drop_table("recurrence_rules")
