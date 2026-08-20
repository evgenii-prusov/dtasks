from __future__ import annotations

from datetime import date, datetime

import msgspec

from .models import Habit, Project, RecurrenceRule, Task, WorkLogDay, WorkLogEntry, WorkLogLink

UNSET = msgspec.UNSET


class TaskOut(msgspec.Struct):
    id: int
    project_id: int
    title: str
    notes: str
    complexity: str
    assigned_today: bool
    assigned_week: bool
    must_have: bool
    is_green: bool
    completed: bool
    completed_at: datetime | None
    position: int
    recurrence_rule_id: int | None
    occurrence_date: date | None


class RecurrenceRuleOut(msgspec.Struct):
    id: int
    project_id: int
    title: str
    notes: str
    complexity: str
    is_green: bool
    weekdays: int


class ProjectOut(msgspec.Struct):
    id: int
    name: str
    group: str
    description: str
    notes: str
    position: int
    tasks: list[TaskOut]
    recurrences: list[RecurrenceRuleOut]


class HabitOut(msgspec.Struct):
    id: int
    name: str
    subtitle: str
    position: int
    log: dict[str, int]  # ISO date -> 0|1|2


class WorkLogLinkOut(msgspec.Struct):
    id: int
    kind: str
    url: str
    label: str


class WorkLogEntryOut(msgspec.Struct):
    id: int
    day: date
    category: str
    title: str
    context: str
    impact: str
    task_id: int | None
    created_at: datetime
    links: list[WorkLogLinkOut]


class WorkLogDayOut(msgspec.Struct):
    day: date
    energy: int  # 0 unset | 1 drained .. 5 strong
    friction: int  # 0 unset | 1 smooth .. 5 blocked
    note: str


class WorkLogBucketOut(msgspec.Struct):
    """One week or month of the rollup.

    Carries its own entries rather than just counts: the rollup exists to be read
    straight through when writing a self-review, not to send you looking things up.
    """

    key: str  # "2026-W34" (ISO week) | "2026-08"
    start: date
    end: date
    total: int
    by_category: dict[str, int]  # zero-filled for categories with no entries
    links_by_kind: dict[str, int]
    with_impact: int  # entries carrying a non-empty impact
    days_logged: int  # distinct days with at least one entry
    # Averaged over days that actually rated the value, since a WorkLogDay row can
    # have energy set and friction unset (or the reverse). Averaging over every row
    # in range would let an unset 0 drag the mean down.
    avg_energy: float | None
    avg_friction: float | None
    friction_notes: list[str]
    entries: list[WorkLogEntryOut]


class WorkLogRollupOut(msgspec.Struct):
    period: str  # "week" | "month"
    buckets: list[WorkLogBucketOut]  # oldest first


class UserOut(msgspec.Struct):
    id: int
    email: str


class SignupPayload(msgspec.Struct):
    email: str
    password: str
    invite_code: str


class LoginPayload(msgspec.Struct):
    email: str
    password: str


class TaskCreate(msgspec.Struct):
    title: str
    notes: str = ""
    complexity: str = "low"
    is_green: bool = False
    assigned_today: bool = False
    assigned_week: bool = False


class ProjectCreate(msgspec.Struct):
    name: str
    group: str = "Work"


class TaskPatch(msgspec.Struct):
    title: str | msgspec.UnsetType = UNSET
    notes: str | msgspec.UnsetType = UNSET
    complexity: str | msgspec.UnsetType = UNSET
    assigned_today: bool | msgspec.UnsetType = UNSET
    assigned_week: bool | msgspec.UnsetType = UNSET
    must_have: bool | msgspec.UnsetType = UNSET
    is_green: bool | msgspec.UnsetType = UNSET
    completed: bool | msgspec.UnsetType = UNSET
    project_id: int | msgspec.UnsetType = UNSET


class RecurrenceRuleCreate(msgspec.Struct):
    title: str
    weekdays: int
    notes: str = ""
    complexity: str = "low"
    is_green: bool = False


class RecurrenceRulePatch(msgspec.Struct):
    title: str | msgspec.UnsetType = UNSET
    notes: str | msgspec.UnsetType = UNSET
    complexity: str | msgspec.UnsetType = UNSET
    is_green: bool | msgspec.UnsetType = UNSET
    weekdays: int | msgspec.UnsetType = UNSET


class ProjectPatch(msgspec.Struct):
    name: str | msgspec.UnsetType = UNSET
    group: str | msgspec.UnsetType = UNSET
    description: str | msgspec.UnsetType = UNSET
    notes: str | msgspec.UnsetType = UNSET


class ReorderPayload(msgspec.Struct):
    direction: str  # "up" | "down"


class HabitCreate(msgspec.Struct):
    name: str
    subtitle: str = ""


class HabitLogPayload(msgspec.Struct):
    day: date
    state: int  # 0|1|2


class WorkLogLinkIn(msgspec.Struct):
    url: str
    kind: str = "link"
    label: str = ""


class WorkLogEntryCreate(msgspec.Struct):
    day: date
    category: str
    title: str
    context: str = ""
    impact: str = ""
    task_id: int | None = None
    links: list[WorkLogLinkIn] = []


class WorkLogEntryPatch(msgspec.Struct):
    day: date | msgspec.UnsetType = UNSET
    category: str | msgspec.UnsetType = UNSET
    title: str | msgspec.UnsetType = UNSET
    context: str | msgspec.UnsetType = UNSET
    impact: str | msgspec.UnsetType = UNSET
    task_id: int | None | msgspec.UnsetType = UNSET
    # Sent whole or not at all: editing evidence is add/remove rows, which a
    # per-field patch can't express. When present it replaces the entry's links.
    links: list[WorkLogLinkIn] | msgspec.UnsetType = UNSET


class WorkLogDayPayload(msgspec.Struct):
    day: date
    energy: int = 0
    friction: int = 0
    note: str = ""


class EventIn(msgspec.Struct):
    """One client-reported event. Every field is untrusted and validated on ingest."""

    event_id: str
    name: str
    occurred_at: datetime
    session_id: str | None = None
    input: str = "unknown"
    surface: str | None = None
    entity_type: str | None = None
    entity_id: int | None = None
    app_version: str | None = None
    # Scalars only; sanitize_props() drops anything else before it is stored.
    props: dict[str, object] | None = None


class EventBatchIn(msgspec.Struct):
    events: list[EventIn]


def task_out(t: Task) -> TaskOut:
    return TaskOut(
        id=t.id,
        project_id=t.project_id,
        title=t.title,
        notes=t.notes,
        complexity=t.complexity,
        assigned_today=t.assigned_today,
        assigned_week=t.assigned_week,
        must_have=t.must_have,
        is_green=t.is_green,
        completed=t.completed,
        completed_at=t.completed_at,
        position=t.position,
        recurrence_rule_id=t.recurrence_rule_id,
        occurrence_date=t.occurrence_date,
    )


def recurrence_out(r: RecurrenceRule) -> RecurrenceRuleOut:
    return RecurrenceRuleOut(
        id=r.id,
        project_id=r.project_id,
        title=r.title,
        notes=r.notes,
        complexity=r.complexity,
        is_green=r.is_green,
        weekdays=r.weekdays,
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
        recurrences=[recurrence_out(r) for r in p.recurrence_rules],
    )


def habit_out(h: Habit) -> HabitOut:
    return HabitOut(
        id=h.id,
        name=h.name,
        subtitle=h.subtitle,
        position=h.position,
        log={log.day.isoformat(): log.state for log in h.logs},
    )


def worklog_link_out(link: WorkLogLink) -> WorkLogLinkOut:
    return WorkLogLinkOut(id=link.id, kind=link.kind, url=link.url, label=link.label)


def worklog_entry_out(e: WorkLogEntry) -> WorkLogEntryOut:
    return WorkLogEntryOut(
        id=e.id,
        day=e.day,
        category=e.category,
        title=e.title,
        context=e.context,
        impact=e.impact,
        task_id=e.task_id,
        created_at=e.created_at,
        links=[worklog_link_out(link) for link in sorted(e.links, key=lambda link: link.id)],
    )


def worklog_day_out(d: WorkLogDay) -> WorkLogDayOut:
    return WorkLogDayOut(day=d.day, energy=d.energy, friction=d.friction, note=d.note)
