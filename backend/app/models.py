from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)  # stored lowercased
    # NULL for OAuth-only accounts (no password set).
    password_hash: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "provider_account_id", name="uq_oauth_accounts_provider_account"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20))  # "google" | "github"
    provider_account_id: Mapped[str] = mapped_column(String(255))  # Google sub / GitHub id-as-string
    email: Mapped[str] = mapped_column(String(255))  # verified email at link time (informational)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nullable at the DB level until the pre-multitenancy rows are backfilled;
    # the application always sets it.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    group: Mapped[str] = mapped_column(String(100), default="Work")
    description: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer, default=0)

    tasks: Mapped[list[Task]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Task.position",
    )
    recurrence_rules: Mapped[list[RecurrenceRule]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("recurrence_rule_id", "occurrence_date", name="uq_recurrence_occurrence_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(500))
    notes: Mapped[str] = mapped_column(Text, default="")
    complexity: Mapped[str] = mapped_column(String(10), default="low")  # low | high
    assigned_today: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_week: Mapped[bool] = mapped_column(Boolean, default=False)
    must_have: Mapped[bool] = mapped_column(Boolean, default=False)
    is_green: Mapped[bool] = mapped_column(Boolean, default=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    recurrence_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurrence_rules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    occurrence_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    project: Mapped[Project] = relationship(back_populates="tasks")


class RecurrenceRule(Base):
    __tablename__ = "recurrence_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(500))
    notes: Mapped[str] = mapped_column(Text, default="")
    complexity: Mapped[str] = mapped_column(String(10), default="low")  # low | high
    is_green: Mapped[bool] = mapped_column(Boolean, default=False)
    weekdays: Mapped[int] = mapped_column(Integer)  # bitmask: bit i set = date.weekday() == i (Mon=0..Sun=6)
    # High-water mark of the last UTC date an occurrence was generated for, so deleting
    # today's occurrence doesn't cause the next lazy-generation pass to recreate it.
    last_generated_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    project: Mapped[Project] = relationship(back_populates="recurrence_rules")


class Event(Base):
    """One append-only record of something the user did.

    Never updated, only inserted (and eventually pruned), so downstream analytics
    can treat ``id`` as a monotonic cursor and ``event_id`` as a dedup key when
    reading incrementally.

    ``input`` is a first-class column rather than a ``props`` key because the
    primary question this table exists to answer -- is the user moving from
    mouse to keyboard? -- filters on it in every query.
    """

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Client-generated UUID. Unique so a retried batch inserts nothing twice.
    event_id: Mapped[str] = mapped_column(String(36), unique=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Per browser tab, so a hotkey miss can be tied to the mouse action that followed it.
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # occurred_at is the client's clock (skewable); received_at is ours. Order by received_at.
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    source: Mapped[str] = mapped_column(String(10))  # web | api
    input: Mapped[str] = mapped_column(String(10), default="unknown")  # keyboard|mouse|touch|pen|unknown
    name: Mapped[str] = mapped_column(String(50))
    entity_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    surface: Mapped[str | None] = mapped_column(String(20), nullable=True)
    props: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON object of scalars
    app_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    subtitle: Mapped[str] = mapped_column(String(200), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)

    logs: Mapped[list[HabitLog]] = relationship(
        back_populates="habit",
        cascade="all, delete-orphan",
    )


class HabitLog(Base):
    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "day", name="uq_habit_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    state: Mapped[int] = mapped_column(Integer, default=0)  # 0 none | 1 minimal | 2 complete

    habit: Mapped[Habit] = relationship(back_populates="logs")


#: Categories a work-log entry can carry. A tuple + handler validation rather than
#: a SQLAlchemy Enum, matching how ``Task.complexity`` and ``HabitLog.state`` are done.
WORKLOG_CATEGORIES = ("shipped", "operational", "glue", "learning")

#: Kinds of evidence a link can be. "link" is the catch-all the client falls back to.
WORKLOG_LINK_KINDS = ("pr", "rfc", "doc", "incident", "link")


class WorkLogEntry(Base):
    """One thing the user did on one day, with the evidence a reviewer needs.

    ``day`` is supplied by the client (the browser's local date) and never derived
    from the server clock -- the same contract as ``HabitLog.day``, and the only way
    the day boundary stays correct for a user who isn't in UTC.
    """

    __tablename__ = "work_log_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    category: Mapped[str] = mapped_column(String(20))  # shipped | operational | glue | learning
    title: Mapped[str] = mapped_column(String(500))
    # Why it mattered / what was broken. The half a review reader needs, and the
    # half you always forget first.
    context: Mapped[str] = mapped_column(Text, default="")
    # Free text on purpose: "p95 checkout 820ms -> 340ms", "3 fewer pages/week".
    # Metrics across entries are too heterogeneous to sum honestly, so the rollup
    # counts entries that *carry* impact rather than aggregating the numbers.
    impact: Mapped[str] = mapped_column(Text, default="")
    # Set when the entry was promoted from a finished task. SET NULL so deleting the
    # task never deletes the record of having done it.
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    links: Mapped[list[WorkLogLink]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
    )


class WorkLogLink(Base):
    """Evidence attached to an entry.

    A child table rather than a JSON column on the entry because the rollup segments
    by kind -- "4 PRs, 1 RFC this week" is the whole point of recording them.
    """

    __tablename__ = "work_log_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("work_log_entries.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="link")  # pr | rfc | doc | incident | link
    url: Mapped[str] = mapped_column(String(1000))
    label: Mapped[str] = mapped_column(String(200), default="")

    entry: Mapped[WorkLogEntry] = relationship(back_populates="links")


class WorkLogDay(Base):
    """The day's sentiment signal, kept independent of that day's entries.

    Deliberately not a parent row of ``WorkLogEntry``: rating a day must never
    require an entry to exist first (or the reverse), and the rollup range-scans
    each of the two tables without a join.
    """

    __tablename__ = "work_log_days"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_work_log_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    energy: Mapped[int] = mapped_column(Integer, default=0)  # 0 unset | 1 drained .. 5 strong
    friction: Mapped[int] = mapped_column(Integer, default=0)  # 0 unset | 1 smooth .. 5 blocked
    note: Mapped[str] = mapped_column(Text, default="")  # what got in the way
