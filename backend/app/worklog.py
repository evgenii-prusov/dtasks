"""The daily work log: capture, and the weekly/monthly rollups built from it.

Its own module rather than more handlers in ``main.py``, following how ``auth.py``
owns ``auth_router``.

The rollup is the first server-side aggregation in this codebase -- every other
aggregate (habit streaks, the report counts) is derived in the browser from a
full-collection GET. It is done here because the history is unbounded and the
range is chosen by the caller, so shipping every entry to the browser to count
them would get worse every month the log is used.

Buckets are computed in Python, not in SQL. SQLite's ``strftime('%W')`` is not
ISO 8601 -- it emits a week 00 and disagrees with ``date.isocalendar()`` around
the new year -- and the rest of the app is Monday-first (``RecurrenceRule.weekdays``
is a bitmask over ``date.weekday()``). ``isocalendar()`` keeps those consistent.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from litestar import Router, delete, get, patch, post, put
from litestar.exceptions import ClientException, NotFoundException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import (
    WORKLOG_CATEGORIES,
    WORKLOG_LINK_KINDS,
    Project,
    Task,
    User,
    WorkLogDay,
    WorkLogEntry,
    WorkLogLink,
)
from .schemas import (
    UNSET,
    WorkLogBucketOut,
    WorkLogDayOut,
    WorkLogDayPayload,
    WorkLogEntryCreate,
    WorkLogEntryOut,
    WorkLogEntryPatch,
    WorkLogLinkIn,
    WorkLogRollupOut,
    worklog_day_out,
    worklog_entry_out,
)

#: Widest range a single request may ask for -- guards against a caller asking for
#: a decade and getting every entry they ever wrote back in one response.
MAX_RANGE_DAYS = 400

#: How much history to show when the caller doesn't say. The client normally sends
#: an explicit range, since only it knows the user's local date.
DEFAULT_ENTRY_DAYS = 14
DEFAULT_WEEK_BUCKETS = 8
DEFAULT_MONTH_BUCKETS = 6

MAX_LINKS_PER_ENTRY = 20
MAX_SIGNAL = 5


# ── Date bucketing ────────────────────────────────────────────────────────


def _week_start(d: date) -> date:
    """The Monday of ``d``'s ISO week."""
    return d - timedelta(days=d.weekday())


def _next_month(d: date) -> date:
    return date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)


def bucket_start(d: date, period: str) -> date:
    return _week_start(d) if period == "week" else d.replace(day=1)


def bucket_end(start: date, period: str) -> date:
    if period == "week":
        return start + timedelta(days=6)
    return _next_month(start) - timedelta(days=1)


def bucket_key(d: date, period: str) -> str:
    """``2026-W34`` for weeks (ISO, Monday-start), ``2026-08`` for months.

    Weeks use the ISO *year*, not the calendar year, so 2026-12-31 and 2027-01-01
    land in the same bucket when they share an ISO week.
    """
    if period == "week":
        iso_year, iso_week, _ = d.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return f"{d.year}-{d.month:02d}"


# ── Ownership and validation ──────────────────────────────────────────────


async def _get_entry(session: AsyncSession, entry_id: int, user_id: int) -> WorkLogEntry:
    entry = (
        await session.execute(
            select(WorkLogEntry)
            .where(WorkLogEntry.id == entry_id, WorkLogEntry.user_id == user_id)
            .options(selectinload(WorkLogEntry.links))
        )
    ).scalar_one_or_none()
    if entry is None:
        raise NotFoundException(detail="Work log entry not found")
    return entry


async def _check_task_owned(session: AsyncSession, task_id: int, user_id: int) -> None:
    """Reject a ``task_id`` the caller doesn't own.

    ``tasks`` carries no ``user_id`` of its own -- it is scoped through
    ``Project.user_id`` -- so without this check an entry could be pointed at
    another tenant's task. 404 rather than 403, matching every other cross-tenant
    path, so ids stay unenumerable.
    """
    owned = (
        await session.execute(
            select(Task.id).join(Project).where(Task.id == task_id, Project.user_id == user_id)
        )
    ).scalar_one_or_none()
    if owned is None:
        raise NotFoundException(detail="Task not found")


def _validate_category(category: str) -> str:
    if category not in WORKLOG_CATEGORIES:
        raise ClientException(detail=f"category must be one of {', '.join(WORKLOG_CATEGORIES)}")
    return category


def _validate_title(title: str) -> str:
    cleaned = title.strip()
    if not cleaned:
        raise ClientException(detail="title must not be empty")
    return cleaned


def _validate_links(links: list[WorkLogLinkIn]) -> list[WorkLogLinkIn]:
    if len(links) > MAX_LINKS_PER_ENTRY:
        raise ClientException(detail=f"at most {MAX_LINKS_PER_ENTRY} links per entry")
    for link in links:
        if not link.url.strip():
            raise ClientException(detail="link url must not be empty")
        if link.kind not in WORKLOG_LINK_KINDS:
            raise ClientException(detail=f"link kind must be one of {', '.join(WORKLOG_LINK_KINDS)}")
    return links


def _validate_signal(name: str, value: int) -> int:
    if not 0 <= value <= MAX_SIGNAL:
        raise ClientException(detail=f"{name} must be between 0 and {MAX_SIGNAL}")
    return value


def _resolve_range(
    start: date | None, end: date | None, default_start: date, default_end: date
) -> tuple[date, date]:
    range_start = start or default_start
    range_end = end or default_end
    if range_end < range_start:
        raise ClientException(detail="end must not be before start")
    if (range_end - range_start).days + 1 > MAX_RANGE_DAYS:
        raise ClientException(detail=f"range must not exceed {MAX_RANGE_DAYS} days")
    return range_start, range_end


def _links_from(payload: list[WorkLogLinkIn]) -> list[WorkLogLink]:
    return [WorkLogLink(kind=link.kind, url=link.url.strip(), label=link.label) for link in payload]


# ── Entries ───────────────────────────────────────────────────────────────


@get("/entries")
async def list_entries(
    session: AsyncSession,
    user: User,
    start: date | None = None,
    end: date | None = None,
) -> list[WorkLogEntryOut]:
    today = datetime.now(UTC).date()
    range_start, range_end = _resolve_range(start, end, today - timedelta(days=DEFAULT_ENTRY_DAYS - 1), today)
    entries = (
        (
            await session.execute(
                select(WorkLogEntry)
                .where(
                    WorkLogEntry.user_id == user.id,
                    WorkLogEntry.day >= range_start,
                    WorkLogEntry.day <= range_end,
                )
                .options(selectinload(WorkLogEntry.links))
                .order_by(WorkLogEntry.day.desc(), WorkLogEntry.id.desc())
            )
        )
        .scalars()
        .all()
    )
    return [worklog_entry_out(e) for e in entries]


@post("/entries")
async def create_entry(data: WorkLogEntryCreate, session: AsyncSession, user: User) -> WorkLogEntryOut:
    title = _validate_title(data.title)
    category = _validate_category(data.category)
    links = _validate_links(data.links)
    if data.task_id is not None:
        await _check_task_owned(session, data.task_id, user.id)

    entry = WorkLogEntry(
        user_id=user.id,
        day=data.day,
        category=category,
        title=title,
        context=data.context,
        impact=data.impact,
        task_id=data.task_id,
        links=_links_from(links),
    )
    session.add(entry)
    await session.commit()
    return worklog_entry_out(entry)


@patch("/entries/{entry_id:int}")
async def update_entry(
    entry_id: int, data: WorkLogEntryPatch, session: AsyncSession, user: User
) -> WorkLogEntryOut:
    entry = await _get_entry(session, entry_id, user.id)

    if data.category is not UNSET:
        _validate_category(data.category)
    if data.title is not UNSET:
        data.title = _validate_title(data.title)
    if data.task_id is not UNSET and data.task_id is not None:
        await _check_task_owned(session, data.task_id, user.id)
    if data.links is not UNSET:
        _validate_links(data.links)

    for field in ("day", "category", "title", "context", "impact", "task_id"):
        value = getattr(data, field)
        if value is not UNSET:
            setattr(entry, field, value)

    if data.links is not UNSET:
        # Replaced wholesale: editing evidence means adding and removing rows,
        # which a per-field patch can't express. delete-orphan drops the old ones.
        entry.links = _links_from(data.links)

    await session.commit()
    return worklog_entry_out(entry)


@delete("/entries/{entry_id:int}", status_code=204)
async def delete_entry(entry_id: int, session: AsyncSession, user: User) -> None:
    entry = await _get_entry(session, entry_id, user.id)
    await session.delete(entry)
    await session.commit()


# ── Day signal ────────────────────────────────────────────────────────────


@get("/days")
async def list_days(
    session: AsyncSession,
    user: User,
    start: date | None = None,
    end: date | None = None,
) -> list[WorkLogDayOut]:
    today = datetime.now(UTC).date()
    range_start, range_end = _resolve_range(start, end, today - timedelta(days=DEFAULT_ENTRY_DAYS - 1), today)
    days = (
        (
            await session.execute(
                select(WorkLogDay)
                .where(
                    WorkLogDay.user_id == user.id,
                    WorkLogDay.day >= range_start,
                    WorkLogDay.day <= range_end,
                )
                .order_by(WorkLogDay.day.desc())
            )
        )
        .scalars()
        .all()
    )
    return [worklog_day_out(d) for d in days]


@put("/day")
async def set_day(data: WorkLogDayPayload, session: AsyncSession, user: User) -> WorkLogDayOut:
    _validate_signal("energy", data.energy)
    _validate_signal("friction", data.friction)

    row = (
        await session.execute(
            select(WorkLogDay).where(WorkLogDay.user_id == user.id, WorkLogDay.day == data.day)
        )
    ).scalar_one_or_none()
    if row is None:
        row = WorkLogDay(user_id=user.id, day=data.day)
        session.add(row)
    row.energy = data.energy
    row.friction = data.friction
    row.note = data.note
    await session.commit()
    return worklog_day_out(row)


# ── Rollup ────────────────────────────────────────────────────────────────


def _default_rollup_range(period: str, today: date) -> tuple[date, date]:
    """Default window, anchored on the server's UTC date but reaching one day past it.

    Entries carry the *client's* local day, which can be a day ahead of ours as
    far as UTC+14. Ending the window on our own date would drop the entry such a
    user just wrote -- their rollup would report zero for the thing they logged
    a minute ago. So the end covers the bucket containing tomorrow. The cost is
    that a UTC-or-behind caller sometimes gets one extra trailing bucket, which
    is empty and therefore already what an unlogged period looks like.
    """
    horizon = today + timedelta(days=1)
    if period == "week":
        start = _week_start(today) - timedelta(weeks=DEFAULT_WEEK_BUCKETS - 1)
        return start, bucket_end(_week_start(horizon), "week")
    first = today.replace(day=1)
    for _ in range(DEFAULT_MONTH_BUCKETS - 1):
        first = (first - timedelta(days=1)).replace(day=1)
    return first, bucket_end(horizon.replace(day=1), "month")


def build_buckets(
    period: str,
    range_start: date,
    range_end: date,
    entries: list[WorkLogEntry],
    days: list[WorkLogDay],
) -> list[WorkLogBucketOut]:
    """Group entries and day signals into consecutive week or month buckets.

    Empty buckets are emitted rather than skipped -- a week with nothing in it is
    itself a signal, and dropping it would silently compress the timeline.
    """
    entries_by_key: dict[str, list[WorkLogEntry]] = defaultdict(list)
    for e in entries:
        entries_by_key[bucket_key(e.day, period)].append(e)

    days_by_key: dict[str, list[WorkLogDay]] = defaultdict(list)
    for d in days:
        days_by_key[bucket_key(d.day, period)].append(d)

    out: list[WorkLogBucketOut] = []
    start = bucket_start(range_start, period)
    while start <= range_end:
        end = bucket_end(start, period)
        key = bucket_key(start, period)
        bucket_entries = entries_by_key.get(key, [])
        bucket_days = days_by_key.get(key, [])

        by_category = dict.fromkeys(WORKLOG_CATEGORIES, 0)
        links_by_kind = dict.fromkeys(WORKLOG_LINK_KINDS, 0)
        for e in bucket_entries:
            if e.category in by_category:
                by_category[e.category] += 1
            for link in e.links:
                if link.kind in links_by_kind:
                    links_by_kind[link.kind] += 1

        # Only days that actually rated a signal count toward its mean: 0 means
        # "not answered", and a row can have one rated and the other not.
        energies = [d.energy for d in bucket_days if d.energy > 0]
        frictions = [d.friction for d in bucket_days if d.friction > 0]

        out.append(
            WorkLogBucketOut(
                key=key,
                start=start,
                end=end,
                total=len(bucket_entries),
                by_category=by_category,
                links_by_kind=links_by_kind,
                with_impact=sum(1 for e in bucket_entries if e.impact.strip()),
                days_logged=len({e.day for e in bucket_entries}),
                avg_energy=round(sum(energies) / len(energies), 2) if energies else None,
                avg_friction=round(sum(frictions) / len(frictions), 2) if frictions else None,
                friction_notes=[
                    d.note.strip() for d in sorted(bucket_days, key=lambda d: d.day) if d.note.strip()
                ],
                entries=[worklog_entry_out(e) for e in sorted(bucket_entries, key=lambda e: (e.day, e.id))],
            )
        )
        start = end + timedelta(days=1)
    return out


@get("/rollup")
async def worklog_rollup(
    session: AsyncSession,
    user: User,
    period: str = "week",
    start: date | None = None,
    end: date | None = None,
) -> WorkLogRollupOut:
    if period not in ("week", "month"):
        raise ClientException(detail="period must be 'week' or 'month'")

    default_start, default_end = _default_rollup_range(period, datetime.now(UTC).date())
    range_start, range_end = _resolve_range(start, end, default_start, default_end)

    entries = (
        (
            await session.execute(
                select(WorkLogEntry)
                .where(
                    WorkLogEntry.user_id == user.id,
                    WorkLogEntry.day >= range_start,
                    WorkLogEntry.day <= range_end,
                )
                .options(selectinload(WorkLogEntry.links))
                .order_by(WorkLogEntry.day, WorkLogEntry.id)
            )
        )
        .scalars()
        .all()
    )
    days = (
        (
            await session.execute(
                select(WorkLogDay).where(
                    WorkLogDay.user_id == user.id,
                    WorkLogDay.day >= range_start,
                    WorkLogDay.day <= range_end,
                )
            )
        )
        .scalars()
        .all()
    )

    return WorkLogRollupOut(
        period=period,
        buckets=build_buckets(period, range_start, range_end, list(entries), list(days)),
    )


worklog_router = Router(
    path="/api/worklog",
    route_handlers=[
        list_entries,
        create_entry,
        update_entry,
        delete_entry,
        list_days,
        set_day,
        worklog_rollup,
    ],
)
