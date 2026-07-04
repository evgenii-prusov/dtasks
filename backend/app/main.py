from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from litestar import Litestar
from litestar import Request
from litestar import Response
from litestar import delete
from litestar import get
from litestar import patch
from litestar import post
from litestar import put
from litestar.config.cors import CORSConfig
from litestar.exceptions import ClientException
from litestar.exceptions import NotFoundException
from litestar.static_files import create_static_files_router
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from . import db
from .auth import auth_router
from .auth import session_auth
from .auth import session_store
from .models import Base
from .models import Habit
from .models import HabitLog
from .models import Project
from .models import Task
from .models import User
from .schemas import (
    UNSET,
    HabitCreate,
    HabitLogPayload,
    HabitOut,
    ProjectCreate,
    ProjectOut,
    ProjectPatch,
    ReorderPayload,
    TaskCreate,
    TaskOut,
    TaskPatch,
    habit_out,
    project_out,
    task_out,
)

MUST_HAVE_LIMIT = 2


@asynccontextmanager
async def lifespan(app: Litestar) -> AsyncGenerator[None, None]:
    async with db.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await db.engine.dispose()


def provide_user(request: Request[User, Any, Any]) -> User:
    return request.user


async def _get_task(session: AsyncSession, task_id: int, user_id: int) -> Task:
    task = (
        await session.execute(
            select(Task)
            .join(Project)
            .where(Task.id == task_id, Project.user_id == user_id)
        )
    ).scalar_one_or_none()
    if task is None:
        raise NotFoundException(detail="Task not found")
    return task


async def _get_project(session: AsyncSession, project_id: int, user_id: int) -> Project:
    project = (
        await session.execute(
            select(Project)
            .where(Project.id == project_id, Project.user_id == user_id)
            .options(selectinload(Project.tasks))
        )
    ).scalar_one_or_none()
    if project is None:
        raise NotFoundException(detail="Project not found")
    return project


async def _get_habit(session: AsyncSession, habit_id: int, user_id: int) -> Habit:
    habit = (
        await session.execute(
            select(Habit).where(Habit.id == habit_id, Habit.user_id == user_id)
        )
    ).scalar_one_or_none()
    if habit is None:
        raise NotFoundException(detail="Habit not found")
    return habit


async def _active_must_have_count(session: AsyncSession, exclude_task_id: int, user_id: int) -> int:
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


@get("/api/projects")
async def list_projects(session: AsyncSession, user: User) -> list[ProjectOut]:
    projects = (
        (
            await session.execute(
                select(Project)
                .where(Project.user_id == user.id)
                .options(selectinload(Project.tasks))
                .order_by(Project.position)
            )
        )
        .scalars()
        .all()
    )
    return [project_out(p) for p in projects]


@post("/api/projects")
async def create_project(data: ProjectCreate, session: AsyncSession, user: User) -> ProjectOut:
    name = data.name.strip()
    if not name:
        raise ClientException(detail="name must not be empty")
    positions = (
        await session.execute(select(Project.position).where(Project.user_id == user.id))
    ).scalars().all()
    project = Project(
        user_id=user.id,
        name=name,
        group=data.group,
        position=max(positions, default=-1) + 1,
        tasks=[],
    )
    session.add(project)
    await session.commit()
    return project_out(project)


@patch("/api/projects/{project_id:int}")
async def update_project(
    project_id: int, data: ProjectPatch, session: AsyncSession, user: User
) -> ProjectOut:
    project = await _get_project(session, project_id, user.id)
    for field in ("name", "group", "description", "notes"):
        value = getattr(data, field)
        if value is not UNSET:
            setattr(project, field, value)
    await session.commit()
    return project_out(project)


@delete("/api/projects/{project_id:int}", status_code=204)
async def delete_project(project_id: int, session: AsyncSession, user: User) -> None:
    project = await _get_project(session, project_id, user.id)
    await session.delete(project)
    await session.commit()


@post("/api/projects/{project_id:int}/tasks")
async def create_task(
    project_id: int, data: TaskCreate, session: AsyncSession, user: User
) -> TaskOut:
    project = await _get_project(session, project_id, user.id)
    if data.complexity not in ("low", "high"):
        raise ClientException(detail="complexity must be 'low' or 'high'")
    task = Task(
        project_id=project.id,
        title=data.title.strip(),
        notes=data.notes,
        complexity=data.complexity,
        recurring=data.recurring,
        position=max((t.position for t in project.tasks), default=-1) + 1,
    )
    if not task.title:
        raise ClientException(detail="title must not be empty")
    session.add(task)
    await session.commit()
    return task_out(task)


@patch("/api/tasks/{task_id:int}")
async def update_task(
    task_id: int, data: TaskPatch, session: AsyncSession, user: User
) -> TaskOut:
    task = await _get_task(session, task_id, user.id)

    for field in ("title", "notes", "complexity", "recurring", "assigned_week", "completed"):
        value = getattr(data, field)
        if value is not UNSET:
            setattr(task, field, value)
    if data.complexity is not UNSET and data.complexity not in ("low", "high"):
        raise ClientException(detail="complexity must be 'low' or 'high'")

    if data.assigned_today is not UNSET:
        task.assigned_today = data.assigned_today
        if not data.assigned_today:
            task.must_have = False

    if data.must_have is not UNSET:
        if data.must_have:
            count = await _active_must_have_count(session, exclude_task_id=task.id, user_id=user.id)
            if count >= MUST_HAVE_LIMIT:
                raise ClientException(
                    detail=f"Max {MUST_HAVE_LIMIT} Must Have tasks per day.", status_code=409
                )
            task.must_have = True
            task.assigned_today = True
        else:
            task.must_have = False

    await session.commit()
    return task_out(task)


@delete("/api/tasks/{task_id:int}", status_code=204)
async def delete_task(task_id: int, session: AsyncSession, user: User) -> None:
    task = await _get_task(session, task_id, user.id)
    await session.delete(task)
    await session.commit()


@post("/api/tasks/{task_id:int}/reorder")
async def reorder_task(
    task_id: int, data: ReorderPayload, session: AsyncSession, user: User
) -> list[TaskOut]:
    if data.direction not in ("up", "down"):
        raise ClientException(detail="direction must be 'up' or 'down'")
    task = await _get_task(session, task_id, user.id)
    project = await _get_project(session, task.project_id, user.id)
    tasks = sorted(project.tasks, key=lambda t: t.position)
    i = next(idx for idx, t in enumerate(tasks) if t.id == task.id)
    j = i - 1 if data.direction == "up" else i + 1
    if 0 <= j < len(tasks):
        tasks[i].position, tasks[j].position = tasks[j].position, tasks[i].position
    await session.commit()
    return [task_out(t) for t in sorted(tasks, key=lambda t: t.position)]


@get("/api/habits")
async def list_habits(session: AsyncSession, user: User) -> list[HabitOut]:
    habits = (
        (
            await session.execute(
                select(Habit)
                .where(Habit.user_id == user.id)
                .options(selectinload(Habit.logs))
                .order_by(Habit.position)
            )
        )
        .scalars()
        .all()
    )
    return [habit_out(h) for h in habits]


@post("/api/habits")
async def create_habit(data: HabitCreate, session: AsyncSession, user: User) -> HabitOut:
    name = data.name.strip()
    if not name:
        raise ClientException(detail="name must not be empty")
    positions = (
        await session.execute(select(Habit.position).where(Habit.user_id == user.id))
    ).scalars().all()
    habit = Habit(
        user_id=user.id,
        name=name,
        subtitle=data.subtitle,
        position=max(positions, default=-1) + 1,
        logs=[],
    )
    session.add(habit)
    await session.commit()
    return habit_out(habit)


@put("/api/habits/{habit_id:int}/log")
async def set_habit_log(
    habit_id: int, data: HabitLogPayload, session: AsyncSession, user: User
) -> HabitOut:
    habit = (
        await session.execute(
            select(Habit)
            .where(Habit.id == habit_id, Habit.user_id == user.id)
            .options(selectinload(Habit.logs))
        )
    ).scalar_one_or_none()
    if habit is None:
        raise NotFoundException(detail="Habit not found")
    if data.state not in (0, 1, 2):
        raise ClientException(detail="state must be 0, 1 or 2")

    existing = next((log for log in habit.logs if log.day == data.day), None)
    if existing:
        existing.state = data.state
    else:
        log = HabitLog(habit_id=habit.id, day=data.day, state=data.state)
        session.add(log)
        habit.logs.append(log)
    await session.commit()
    return habit_out(habit)


@delete("/api/habits/{habit_id:int}", status_code=204)
async def delete_habit(habit_id: int, session: AsyncSession, user: User) -> None:
    habit = await _get_habit(session, habit_id, user.id)
    await session.delete(habit)
    await session.commit()


FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def not_found_handler(request: Request, exc: NotFoundException) -> Response:
    """Serve the SPA entry point for client-side routes like /plan or /habits."""
    index = FRONTEND_DIST / "index.html"
    if not request.url.path.startswith("/api") and index.is_file():
        return Response(content=index.read_bytes(), media_type="text/html")
    return Response(
        content={"status_code": 404, "detail": exc.detail},
        media_type="application/json",
        status_code=404,
    )


route_handlers: list = [
    auth_router,
    list_projects,
    create_project,
    update_project,
    delete_project,
    create_task,
    update_task,
    delete_task,
    reorder_task,
    list_habits,
    create_habit,
    set_habit_log,
    delete_habit,
]
if FRONTEND_DIST.is_dir():
    route_handlers.append(
        create_static_files_router(path="/", directories=[FRONTEND_DIST], html_mode=True)
    )

app = Litestar(
    route_handlers=route_handlers,
    dependencies={"session": db.provide_session, "user": provide_user},
    lifespan=[lifespan],
    on_app_init=[session_auth.on_app_init],
    stores={"sessions": session_store()},
    cors_config=CORSConfig(allow_origins=["http://localhost:5173"]),
    exception_handlers={NotFoundException: not_found_handler},
)
