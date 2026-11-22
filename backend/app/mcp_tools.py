"""The MCP connector's tools (docs/mcp.md §4).

Thin wrappers: every rule lives in ``planning.py`` / ``worklog.py``, shared with
the REST API. A tool resolves the caller from the bearer token, runs the shared
code in its own DB session, and turns the API's 4xx errors into ``ToolError``s,
whose message the model reads and can act on.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from litestar.exceptions import HTTPException
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from . import db
from .models import Habit, Project, Task, WorkLogEntry
from .planning import (
    DEFAULT_PROJECT_NAME,
    INBOX_GROUP,
    add_task,
    apply_task_patch,
    ensure_default_projects,
    ensure_recurring_occurrences,
    get_task,
    projects_ordered,
    set_habit_state,
)
from .schemas import UNSET, TaskCreate, TaskPatch, WorkLogEntryCreate
from .worklog import add_entry, entries_between

Plan = Literal["today", "week", "backlog"]
Complexity = Literal["low", "high"]
HabitState = Literal["none", "minimal", "complete"]
WorkLogCategory = Literal["shipped", "operational", "glue", "learning"]

HABIT_STATES: tuple[HabitState, ...] = ("none", "minimal", "complete")  # index = stored value
SEARCH_LIMIT = 50

GREEN = (
    "green: a task that moves the user toward their own goals and dreams, as opposed to "
    "reactive work that others bring (Dorofeev's 'green tasks')."
)
PLAN = (
    "plan: 'today' (on today's list), 'week' (planned for this week but not today) "
    "or 'backlog' (not planned)."
)
PROJECT = (
    "project: a project name (case-insensitive), 'Group / Name', a group name ('Work', "
    "'Personal') for that group's default project, or a numeric id."
)

READ = ToolAnnotations(readOnlyHint=True)
WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False)


@asynccontextmanager
async def _user_session() -> AsyncIterator[tuple[AsyncSession, int]]:
    token = get_access_token()
    if token is None or token.subject is None:
        raise ToolError("Not authenticated")
    async with db.session_factory() as session:
        try:
            yield session, int(token.subject)
        except HTTPException as exc:  # the shared rules speak HTTP; the model reads the detail
            raise ToolError(exc.detail) from exc


def _today() -> date:
    # UTC, like the rest of the app (docs/mcp.md §5).
    return datetime.now(UTC).date()


# ── projects ──────────────────────────────────────────────────────────────


def _label(project: Project) -> str:
    if project.group == INBOX_GROUP:
        return project.name
    if project.name == DEFAULT_PROJECT_NAME:
        return project.group
    return f"{project.group} / {project.name}"


async def _projects(session: AsyncSession, user_id: int) -> list[Project]:
    await ensure_default_projects(session, user_id)
    return list((await session.execute(projects_ordered(user_id))).scalars().all())


async def _resolve_project(session: AsyncSession, user_id: int, ref: str) -> Project:
    projects = await _projects(session, user_id)
    key = ref.strip().casefold()
    matches = [p for p in projects if key in (str(p.id), _label(p).casefold(), p.name.casefold())]
    if len(matches) == 1:
        return matches[0]
    problem = "is ambiguous" if matches else "matches no project"
    raise ToolError(f"Project '{ref}' {problem}. Projects: {', '.join(_label(p) for p in projects)}")


# ── tasks ─────────────────────────────────────────────────────────────────


def _plan(task: Task) -> Plan:
    if task.assigned_today:
        return "today"
    return "week" if task.assigned_week else "backlog"


def _task(task: Task, project: Project) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "notes": task.notes,
        "project": _label(project),
        "plan": _plan(task),
        "green": task.is_green,
        "must_have": task.must_have,
        "complexity": task.complexity,
        "completed": task.completed,
    }


def _plan_flags(plan: Plan) -> dict[str, bool]:
    return {"assigned_today": plan == "today", "assigned_week": plan == "week"}


async def _tasks(session: AsyncSession, user_id: int, *conditions: Any) -> list[dict[str, Any]]:
    rows = await session.execute(
        select(Task, Project)
        .join(Project)
        .where(Project.user_id == user_id, *conditions)
        .order_by(Project.position, Task.position)
        .limit(SEARCH_LIMIT)
    )
    return [_task(task, project) for task, project in rows.all()]


async def _task_out(session: AsyncSession, task: Task) -> dict[str, Any]:
    project = await session.get(Project, task.project_id)
    assert project is not None
    return _task(task, project)


# ── habits ────────────────────────────────────────────────────────────────


async def _habits(session: AsyncSession, user_id: int) -> list[Habit]:
    return list(
        (
            await session.execute(
                select(Habit)
                .where(Habit.user_id == user_id)
                .options(selectinload(Habit.logs))
                .order_by(Habit.position)
            )
        )
        .scalars()
        .all()
    )


def _habit_state(habit: Habit, day: date) -> HabitState:
    log = next((log for log in habit.logs if log.day == day), None)
    return HABIT_STATES[log.state if log else 0]


def _entry(entry: WorkLogEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "date": entry.day.isoformat(),
        "category": entry.category,
        "title": entry.title,
        "context": entry.context,
        "impact": entry.impact,
    }


def register_tools(server: MCPServer) -> None:
    @server.tool(annotations=READ)
    async def get_today() -> dict[str, Any]:
        """The user's plan for today: open tasks on today's list (plus ones finished today),
        and each habit with today's state (none | minimal | complete)."""
        async with _user_session() as (session, user_id):
            await ensure_recurring_occurrences(session, user_id)
            started = datetime.combine(_today(), datetime.min.time(), UTC)
            tasks = await _tasks(
                session,
                user_id,
                Task.assigned_today.is_(True),
                or_(Task.completed.is_(False), Task.completed_at >= started),
            )
            habits = await _habits(session, user_id)
            return {
                "date": _today().isoformat(),
                "tasks": tasks,
                "habits": [{"name": h.name, "state": _habit_state(h, _today())} for h in habits],
            }

    @server.tool(annotations=READ)
    async def get_week() -> list[dict[str, Any]]:
        """Open tasks planned for this week, including those also on today's list."""
        async with _user_session() as (session, user_id):
            return await _tasks(session, user_id, Task.assigned_week.is_(True), Task.completed.is_(False))

    @server.tool(
        annotations=READ,
        description="Find tasks whose title or notes contain `query` (empty matches all), "
        "optionally within one project. Returns at most 50. " + PROJECT,
    )
    async def search_tasks(
        query: str = "", project: str | None = None, include_completed: bool = False
    ) -> list[dict[str, Any]]:
        async with _user_session() as (session, user_id):
            conditions: list[Any] = []
            if query.strip():
                pattern = f"%{query.strip()}%"
                conditions.append(or_(Task.title.ilike(pattern), Task.notes.ilike(pattern)))
            if project is not None:
                conditions.append(Task.project_id == (await _resolve_project(session, user_id, project)).id)
            if not include_completed:
                conditions.append(Task.completed.is_(False))
            return await _tasks(session, user_id, *conditions)

    @server.tool(annotations=READ)
    async def list_projects() -> list[dict[str, Any]]:
        """The user's projects with their number of open tasks. Use the `project` label
        when passing a project to other tools."""
        async with _user_session() as (session, user_id):
            return [
                {
                    "id": p.id,
                    "project": _label(p),
                    "description": p.description,
                    "open_tasks": sum(not t.completed for t in p.tasks),
                }
                for p in await _projects(session, user_id)
            ]

    @server.tool(
        name="add_task",
        annotations=WRITE,
        description="Create a task. Defaults to the Inbox, the place for things not yet sorted. "
        "must_have marks one of at most two must-do tasks for today (implies plan='today'). "
        + " ".join((PROJECT, PLAN, GREEN)),
    )
    async def create_task(
        title: str,
        project: str = "Inbox",
        notes: str = "",
        plan: Plan = "backlog",
        green: bool = False,
        must_have: bool = False,
        complexity: Complexity = "low",
    ) -> dict[str, Any]:
        async with _user_session() as (session, user_id):
            target = await _resolve_project(session, user_id, project)
            task = add_task(
                target,
                TaskCreate(
                    title=title, notes=notes, complexity=complexity, is_green=green, **_plan_flags(plan)
                ),
            )
            session.add(task)
            await session.flush()
            if must_have:
                await apply_task_patch(session, task, TaskPatch(must_have=True), user_id)
            await session.commit()
            return await _task_out(session, task)

    @server.tool(
        annotations=WRITE,
        description="Change a task: rename, edit notes, move to another project, re-plan, or flag it. "
        "Only the arguments given are changed. At most two must-have tasks per day. "
        + " ".join((PROJECT, PLAN, GREEN)),
    )
    async def update_task(
        task_id: int,
        title: str | None = None,
        notes: str | None = None,
        project: str | None = None,
        plan: Plan | None = None,
        green: bool | None = None,
        must_have: bool | None = None,
        complexity: Complexity | None = None,
    ) -> dict[str, Any]:
        async with _user_session() as (session, user_id):
            task = await get_task(session, task_id, user_id)
            patch = TaskPatch(
                title=UNSET if title is None else title,
                notes=UNSET if notes is None else notes,
                complexity=UNSET if complexity is None else complexity,
                is_green=UNSET if green is None else green,
                must_have=UNSET if must_have is None else must_have,
            )
            if plan is not None:
                # Today's list sits inside the week, so moving a task onto it keeps its week flag.
                patch.assigned_today = plan == "today"
                if plan != "today":
                    patch.assigned_week = plan == "week"
            if project is not None:
                patch.project_id = (await _resolve_project(session, user_id, project)).id
            await apply_task_patch(session, task, patch, user_id)
            await session.commit()
            return await _task_out(session, task)

    @server.tool(annotations=WRITE)
    async def complete_task(task_id: int) -> dict[str, Any]:
        """Mark a task done."""
        return await _set_completed(task_id, True)

    @server.tool(annotations=WRITE)
    async def uncomplete_task(task_id: int) -> dict[str, Any]:
        """Mark a done task as not done again."""
        return await _set_completed(task_id, False)

    @server.tool(annotations=READ)
    async def list_habits() -> list[dict[str, Any]]:
        """The user's habits with their state (none | minimal | complete) for each of the last 7 days."""
        async with _user_session() as (session, user_id):
            days = [_today() - timedelta(days=n) for n in range(6, -1, -1)]
            return [
                {
                    "name": h.name,
                    "subtitle": h.subtitle,
                    "last_7_days": {d.isoformat(): _habit_state(h, d) for d in days},
                }
                for h in await _habits(session, user_id)
            ]

    @server.tool(annotations=WRITE)
    async def log_habit(
        habit: str, state: HabitState = "complete", day: date | None = None
    ) -> dict[str, Any]:
        """Record a habit for a day (default today): 'complete', 'minimal' (the smallest
        version still counts), or 'none' to clear it. `habit` is its name (case-insensitive)."""
        async with _user_session() as (session, user_id):
            habits = await _habits(session, user_id)
            match = [h for h in habits if h.name.casefold() == habit.strip().casefold()]
            if len(match) != 1:
                raise ToolError(f"Habit '{habit}' not found. Habits: {', '.join(h.name for h in habits)}")
            day = day or _today()
            set_habit_state(match[0], day, HABIT_STATES.index(state))
            await session.commit()
            return {"name": match[0].name, "date": day.isoformat(), "state": state}

    @server.tool(annotations=WRITE)
    async def add_worklog_entry(
        title: str,
        category: WorkLogCategory,
        day: date | None = None,
        context: str = "",
        impact: str = "",
    ) -> dict[str, Any]:
        """Add a work-log entry (default today). category: 'shipped' (delivered work),
        'operational' (keeping things running), 'glue' (helping others, coordination),
        'learning'. context: why it mattered; impact: a measurable result, if any."""
        async with _user_session() as (session, user_id):
            entry = await add_entry(
                session,
                user_id,
                WorkLogEntryCreate(
                    day=day or _today(), category=category, title=title, context=context, impact=impact
                ),
            )
            await session.commit()
            return _entry(entry)

    @server.tool(annotations=READ)
    async def get_worklog(start: date | None = None, end: date | None = None) -> list[dict[str, Any]]:
        """Work-log entries between two dates inclusive, newest first. Defaults to the last 14 days."""
        async with _user_session() as (session, user_id):
            return [_entry(e) for e in await entries_between(session, user_id, start, end)]


async def _set_completed(task_id: int, completed: bool) -> dict[str, Any]:
    async with _user_session() as (session, user_id):
        task = await get_task(session, task_id, user_id)
        await apply_task_patch(session, task, TaskPatch(completed=completed), user_id)
        await session.commit()
        return await _task_out(session, task)
