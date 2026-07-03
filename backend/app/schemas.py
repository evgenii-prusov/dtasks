from __future__ import annotations

from datetime import date

import msgspec

from .models import Habit, Project, Task

UNSET = msgspec.UNSET


class TaskOut(msgspec.Struct):
    id: int
    project_id: int
    title: str
    notes: str
    complexity: str
    recurring: bool
    assigned_today: bool
    assigned_week: bool
    must_have: bool
    completed: bool
    position: int


class ProjectOut(msgspec.Struct):
    id: int
    name: str
    group: str
    description: str
    notes: str
    position: int
    tasks: list[TaskOut]


class HabitOut(msgspec.Struct):
    id: int
    name: str
    subtitle: str
    position: int
    log: dict[str, int]  # ISO date -> 0|1|2


class TaskCreate(msgspec.Struct):
    title: str
    notes: str = ""
    complexity: str = "low"
    recurring: bool = False


class TaskPatch(msgspec.Struct):
    title: str | msgspec.UnsetType = UNSET
    notes: str | msgspec.UnsetType = UNSET
    complexity: str | msgspec.UnsetType = UNSET
    recurring: bool | msgspec.UnsetType = UNSET
    assigned_today: bool | msgspec.UnsetType = UNSET
    assigned_week: bool | msgspec.UnsetType = UNSET
    must_have: bool | msgspec.UnsetType = UNSET
    completed: bool | msgspec.UnsetType = UNSET


class ProjectPatch(msgspec.Struct):
    name: str | msgspec.UnsetType = UNSET
    group: str | msgspec.UnsetType = UNSET
    description: str | msgspec.UnsetType = UNSET
    notes: str | msgspec.UnsetType = UNSET


class ReorderPayload(msgspec.Struct):
    direction: str  # "up" | "down"


class HabitLogPayload(msgspec.Struct):
    day: date
    state: int  # 0|1|2


def task_out(t: Task) -> TaskOut:
    return TaskOut(
        id=t.id,
        project_id=t.project_id,
        title=t.title,
        notes=t.notes,
        complexity=t.complexity,
        recurring=t.recurring,
        assigned_today=t.assigned_today,
        assigned_week=t.assigned_week,
        must_have=t.must_have,
        completed=t.completed,
        position=t.position,
    )


def project_out(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        name=p.name,
        group=p.group,
        description=p.description,
        notes=p.notes,
        position=p.position,
        tasks=[task_out(t) for t in sorted(p.tasks, key=lambda t: t.position)],
    )


def habit_out(h: Habit) -> HabitOut:
    return HabitOut(
        id=h.id,
        name=h.name,
        subtitle=h.subtitle,
        position=h.position,
        log={log.day.isoformat(): log.state for log in h.logs},
    )
