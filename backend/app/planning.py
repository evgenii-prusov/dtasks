"""Tasks, projects and habits: the rules both the REST API and the MCP tools apply.

Extracted from ``main.py`` so the MCP connector (``mcp_tools.py``) changes data
through exactly the same code paths as the SPA, without importing the app.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from litestar.exceptions import ClientException, NotFoundException
from sqlalchemy import case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import Habit, HabitLog, Project, RecurrenceRule, Task
from .schemas import UNSET, TaskCreate, TaskPatch

MUST_HAVE_LIMIT = 2

#: The one place a task can be parked without deciding where it belongs. A single
#: server-managed project, in a group of its own so it is never one of the
#: Work/Personal choices the user is trying to avoid making.
INBOX_PROJECT_NAME = "Inbox"
INBOX_GROUP = "Inbox"

#: Name reserved for the per-group catch-all projects.
DEFAULT_PROJECT_NAME = "..."


def projects_ordered(user_id: int):
    """Every project of ``user_id``, Inbox first, then by position.

    The Inbox is the first thing you look at -- when planning, and as the first
    phase of a review -- so its place in the list is a property of the query
    rather than of whatever position row it happens to hold.
    """
    return (
        select(Project)
        .where(Project.user_id == user_id)
        .options(selectinload(Project.tasks), selectinload(Project.recurrence_rules))
        .order_by(case((Project.group == INBOX_GROUP, 0), else_=1), Project.position)
    )


async def get_task(session: AsyncSession, task_id: int, user_id: int) -> Task:
    task = (
        await session.execute(
            select(Task).join(Project).where(Task.id == task_id, Project.user_id == user_id)
        )
    ).scalar_one_or_none()
    if task is None:
        raise NotFoundException(detail="Task not found")
    return task


async def get_project(session: AsyncSession, project_id: int, user_id: int) -> Project:
    project = (
        await session.execute(
            select(Project)
            .where(Project.id == project_id, Project.user_id == user_id)
            .options(selectinload(Project.tasks), selectinload(Project.recurrence_rules))
        )
    ).scalar_one_or_none()
    if project is None:
        raise NotFoundException(detail="Project not found")
    return project


async def get_habit(session: AsyncSession, habit_id: int, user_id: int) -> Habit:
    habit = (
        await session.execute(select(Habit).where(Habit.id == habit_id, Habit.user_id == user_id))
    ).scalar_one_or_none()
    if habit is None:
        raise NotFoundException(detail="Habit not found")
    return habit


async def active_must_have_count(session: AsyncSession, exclude_task_id: int, user_id: int) -> int:
    rows = await session.execute(
        select(Task.id)
        .join(Project)
        .where(
            Task.must_have.is_(True),
            Task.assigned_today.is_(True),
            Task.completed.is_(False),
            Task.id != exclude_task_id,
            Project.user_id == user_id,
        )
    )
    return len(rows.all())


async def ensure_default_projects(session: AsyncSession, user_id: int) -> None:
    added = False
    inbox = (
        (
            await session.execute(
                select(Project).where(Project.user_id == user_id, Project.group == INBOX_GROUP).limit(1)
            )
        )
        .scalars()
        .first()
    )

    if inbox is None:
        positions = (
            (await session.execute(select(Project.position).where(Project.user_id == user_id)))
            .scalars()
            .all()
        )
        # Below every existing project, so an account that predates the Inbox gets
        # it at the front of the list rather than tacked onto the end.
        session.add(
            Project(
                user_id=user_id,
                name=INBOX_PROJECT_NAME,
                group=INBOX_GROUP,
                description="Unsorted ideas. Park them here, decide later.",
                position=min(positions, default=0) - 1,
                tasks=[],
            )
        )
        added = True

    work_proj = (
        await session.execute(
            select(Project).where(
                Project.user_id == user_id,
                Project.name == DEFAULT_PROJECT_NAME,
                Project.group == "Work",
            )
        )
    ).scalar_one_or_none()

    if work_proj is None:
        positions = (
            (await session.execute(select(Project.position).where(Project.user_id == user_id)))
            .scalars()
            .all()
        )
        next_pos = max(positions, default=-1) + 1
        work_proj = Project(
            user_id=user_id,
            name=DEFAULT_PROJECT_NAME,
            group="Work",
            description="Default project for Work tasks.",
            position=next_pos,
            tasks=[],
        )
        session.add(work_proj)
        added = True

    personal_proj = (
        await session.execute(
            select(Project).where(
                Project.user_id == user_id,
                Project.name == DEFAULT_PROJECT_NAME,
                Project.group == "Personal",
            )
        )
    ).scalar_one_or_none()

    if personal_proj is None:
        positions = (
            (await session.execute(select(Project.position).where(Project.user_id == user_id)))
            .scalars()
            .all()
        )
        next_pos = max(positions, default=-1) + 1
        personal_proj = Project(
            user_id=user_id,
            name=DEFAULT_PROJECT_NAME,
            group="Personal",
            description="Default project for Personal tasks.",
            position=next_pos,
            tasks=[],
        )
        session.add(personal_proj)
        added = True

    if added:
        await session.commit()


async def ensure_recurring_occurrences(session: AsyncSession, user_id: int) -> None:
    """Lazily materialize today's Task occurrence for each due RecurrenceRule.

    Guards generation with ``last_generated_date`` (a high-water mark) rather than
    "does a live Task row exist for today" — the latter would resurrect an occurrence
    the user just deleted, since the very next ['projects'] refetch would see no row
    and recreate it. The high-water mark makes "delete today's occurrence" behave as
    a real skip: last_generated_date already advanced past today, so it stays gone
    until the next due day.
    """
    today = datetime.now(UTC).date()
    weekday_bit = 1 << today.weekday()
    rules = (
        (
            await session.execute(
                select(RecurrenceRule).where(
                    RecurrenceRule.user_id == user_id,
                    RecurrenceRule.weekdays.op("&")(weekday_bit) != 0,
                    or_(
                        RecurrenceRule.last_generated_date.is_(None),
                        RecurrenceRule.last_generated_date < today,
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    if not rules:
        return
    for rule in rules:
        # A series has at most one open occurrence. If an earlier one was never
        # completed, carry it forward to today rather than stacking a fresh copy
        # beside it -- otherwise every missed day leaves another duplicate on
        # Today. Older extras (left by the stacking behaviour this replaces) are
        # dropped; completed occurrences are history and stay untouched.
        stale_open = (
            (
                await session.execute(
                    select(Task)
                    .where(
                        Task.recurrence_rule_id == rule.id,
                        Task.completed.is_(False),
                        Task.occurrence_date < today,
                    )
                    .order_by(Task.occurrence_date.desc(), Task.id.desc())
                )
            )
            .scalars()
            .all()
        )
        if stale_open:
            keep, *extras = stale_open
            for extra in extras:
                await session.delete(extra)
            keep.occurrence_date = today
            keep.assigned_today = True
            keep.assigned_week = False
            rule.last_generated_date = today
            continue
        positions = (
            (await session.execute(select(Task.position).where(Task.project_id == rule.project_id)))
            .scalars()
            .all()
        )
        session.add(
            Task(
                project_id=rule.project_id,
                title=rule.title,
                notes=rule.notes,
                complexity=rule.complexity,
                is_green=rule.is_green,
                assigned_today=True,
                recurrence_rule_id=rule.id,
                occurrence_date=today,
                position=max(positions, default=-1) + 1,
            )
        )
        rule.last_generated_date = today
    await session.commit()


def add_task(project: Project, data: TaskCreate) -> Task:
    """A new task at the bottom of ``project`` (its tasks must be loaded); caller adds and commits."""
    if data.complexity not in ("low", "high"):
        raise ClientException(detail="complexity must be 'low' or 'high'")
    task = Task(
        project_id=project.id,
        title=data.title.strip(),
        notes=data.notes,
        complexity=data.complexity,
        is_green=data.is_green,
        assigned_today=data.assigned_today,
        assigned_week=data.assigned_week,
        position=max((t.position for t in project.tasks), default=-1) + 1,
    )
    if not task.title:
        raise ClientException(detail="title must not be empty")
    return task


async def apply_task_patch(session: AsyncSession, task: Task, data: TaskPatch, user_id: int) -> None:
    """Apply every field ``data`` carries to ``task``, enforcing the planning rules; caller commits."""
    for field in (
        "title",
        "notes",
        "complexity",
        "assigned_week",
        "is_green",
    ):
        value = getattr(data, field)
        if value is not UNSET:
            setattr(task, field, value)

    if data.completed is not UNSET:
        task.completed = data.completed
        task.completed_at = datetime.now(UTC) if data.completed else None
    if data.complexity is not UNSET and data.complexity not in ("low", "high"):
        raise ClientException(detail="complexity must be 'low' or 'high'")

    if data.assigned_today is not UNSET:
        task.assigned_today = data.assigned_today
        if not data.assigned_today:
            task.must_have = False

    if data.must_have is not UNSET:
        if data.must_have:
            count = await active_must_have_count(session, exclude_task_id=task.id, user_id=user_id)
            if count >= MUST_HAVE_LIMIT:
                raise ClientException(
                    detail=f"Max {MUST_HAVE_LIMIT} Must Have tasks per day.", status_code=409
                )
            task.must_have = True
            task.assigned_today = True
        else:
            task.must_have = False

    if data.project_id is not UNSET:
        new_project = await get_project(session, data.project_id, user_id)
        task.project_id = new_project.id
        task.position = max((t.position for t in new_project.tasks if t.id != task.id), default=-1) + 1


def set_habit_state(habit: Habit, day: date, state: int) -> None:
    """Record ``state`` (0 none | 1 minimal | 2 complete) for ``day``; ``habit.logs`` must be loaded."""
    if state not in (0, 1, 2):
        raise ClientException(detail="state must be 0, 1 or 2")

    existing = next((log for log in habit.logs if log.day == day), None)
    if existing:
        existing.state = state
    else:
        log = HabitLog(habit_id=habit.id, day=day, state=state)
        habit.logs.append(log)
