from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from litestar.testing import AsyncTestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import WorkLogDay, WorkLogEntry, WorkLogLink
from app.worklog import _default_rollup_range, bucket_key, build_buckets

pytestmark = pytest.mark.anyio


def _entry(day: str, category: str = "shipped", **kw) -> dict:
    return {"day": day, "category": category, "title": kw.pop("title", "Shipped a thing"), **kw}


async def _create(client: AsyncTestClient, **kw) -> dict:
    resp = await client.post("/api/worklog/entries", json=_entry(**kw))
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _first_task_id(client: AsyncTestClient) -> int:
    projects = (await client.get("/api/projects")).json()
    return next(p for p in projects if p["tasks"])["tasks"][0]["id"]


# ── Entries ───────────────────────────────────────────────────────────────


async def test_create_and_list_entry_round_trip(client: AsyncTestClient) -> None:
    created = await _create(
        client,
        day="2026-08-19",
        category="operational",
        title="  Cut alert noise  ",
        context="Pager fired 14 times a week",
        impact="14 pages/week -> 3",
        links=[{"url": "https://github.com/o/r/pull/42", "kind": "pr", "label": "PR 42"}],
    )
    assert created["title"] == "Cut alert noise"  # trimmed
    assert created["category"] == "operational"
    assert created["impact"] == "14 pages/week -> 3"
    assert [link["kind"] for link in created["links"]] == ["pr"]

    listed = (await client.get("/api/worklog/entries?start=2026-08-01&end=2026-08-31")).json()
    assert [e["id"] for e in listed] == [created["id"]]
    assert listed[0]["links"][0]["url"] == "https://github.com/o/r/pull/42"


async def test_list_excludes_entries_outside_the_range(client: AsyncTestClient) -> None:
    await _create(client, day="2026-08-19", title="inside")
    await _create(client, day="2026-06-01", title="outside")

    listed = (await client.get("/api/worklog/entries?start=2026-08-01&end=2026-08-31")).json()
    assert [e["title"] for e in listed] == ["inside"]


async def test_patch_replaces_links_wholesale_without_orphans(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    created = await _create(
        client,
        day="2026-08-19",
        links=[
            {"url": "https://example.com/a", "kind": "pr"},
            {"url": "https://example.com/b", "kind": "doc"},
        ],
    )

    resp = await client.patch(
        f"/api/worklog/entries/{created['id']}",
        json={"links": [{"url": "https://example.com/c", "kind": "rfc"}]},
    )
    assert resp.status_code == 200, resp.text
    assert [link["url"] for link in resp.json()["links"]] == ["https://example.com/c"]

    async with db() as session:
        total = (await session.execute(select(func.count()).select_from(WorkLogLink))).scalar()
    assert total == 1


async def test_patch_leaves_links_alone_when_not_sent(client: AsyncTestClient) -> None:
    created = await _create(client, day="2026-08-19", links=[{"url": "https://example.com/a", "kind": "pr"}])

    resp = await client.patch(f"/api/worklog/entries/{created['id']}", json={"title": "renamed"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "renamed"
    assert len(resp.json()["links"]) == 1


async def test_delete_entry_cascades_links(client: AsyncTestClient, db: async_sessionmaker) -> None:
    created = await _create(client, day="2026-08-19", links=[{"url": "https://example.com/a", "kind": "pr"}])

    assert (await client.delete(f"/api/worklog/entries/{created['id']}")).status_code == 204

    async with db() as session:
        entries = (await session.execute(select(func.count()).select_from(WorkLogEntry))).scalar()
        links = (await session.execute(select(func.count()).select_from(WorkLogLink))).scalar()
    assert entries == 0
    assert links == 0


@pytest.mark.parametrize(
    ("payload", "detail_fragment"),
    [
        ({"day": "2026-08-19", "category": "nonsense", "title": "x"}, "category"),
        ({"day": "2026-08-19", "category": "shipped", "title": "   "}, "title"),
        (
            {
                "day": "2026-08-19",
                "category": "shipped",
                "title": "x",
                "links": [{"url": "https://e.com", "kind": "bogus"}],
            },
            "link kind",
        ),
        (
            {"day": "2026-08-19", "category": "shipped", "title": "x", "links": [{"url": "  "}]},
            "link url",
        ),
    ],
)
async def test_create_entry_validation(client: AsyncTestClient, payload: dict, detail_fragment: str) -> None:
    resp = await client.post("/api/worklog/entries", json=payload)
    assert resp.status_code == 400, resp.text
    assert detail_fragment in resp.json()["detail"]


async def test_range_validation(client: AsyncTestClient) -> None:
    backwards = await client.get("/api/worklog/entries?start=2026-08-31&end=2026-08-01")
    assert backwards.status_code == 400
    assert "end must not be before start" in backwards.json()["detail"]

    too_wide = await client.get("/api/worklog/entries?start=2020-01-01&end=2026-08-01")
    assert too_wide.status_code == 400
    assert "range" in too_wide.json()["detail"]


# ── Task promotion ────────────────────────────────────────────────────────


async def test_entry_can_be_promoted_from_an_owned_task(client: AsyncTestClient) -> None:
    task_id = await _first_task_id(client)
    created = await _create(client, day="2026-08-19", task_id=task_id)
    assert created["task_id"] == task_id


async def test_entry_survives_deleting_its_task(client: AsyncTestClient) -> None:
    task_id = await _first_task_id(client)
    created = await _create(client, day="2026-08-19", task_id=task_id)

    assert (await client.delete(f"/api/tasks/{task_id}")).status_code == 204

    listed = (await client.get("/api/worklog/entries?start=2026-08-01&end=2026-08-31")).json()
    assert [e["id"] for e in listed] == [created["id"]]
    # SET NULL: deleting the task must not delete the record of having done it.
    assert listed[0]["task_id"] is None


# ── Day signal ────────────────────────────────────────────────────────────


async def test_set_day_upserts_rather_than_duplicating(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    first = await client.put(
        "/api/worklog/day", json={"day": "2026-08-19", "energy": 4, "friction": 2, "note": "flaky CI"}
    )
    assert first.status_code == 200, first.text
    assert first.json() == {"day": "2026-08-19", "energy": 4, "friction": 2, "note": "flaky CI"}

    second = await client.put("/api/worklog/day", json={"day": "2026-08-19", "energy": 2})
    assert second.json()["energy"] == 2
    assert second.json()["note"] == ""

    async with db() as session:
        rows = (await session.execute(select(func.count()).select_from(WorkLogDay))).scalar()
    assert rows == 1


async def test_list_days_in_range(client: AsyncTestClient) -> None:
    await client.put("/api/worklog/day", json={"day": "2026-08-19", "energy": 4})
    await client.put("/api/worklog/day", json={"day": "2026-06-01", "energy": 1})

    days = (await client.get("/api/worklog/days?start=2026-08-01&end=2026-08-31")).json()
    assert [d["day"] for d in days] == ["2026-08-19"]


@pytest.mark.parametrize("payload", [{"energy": 6}, {"energy": -1}, {"friction": 9}])
async def test_day_signal_validation(client: AsyncTestClient, payload: dict) -> None:
    resp = await client.put("/api/worklog/day", json={"day": "2026-08-19", **payload})
    assert resp.status_code == 400, resp.text
    assert "between 0 and 5" in resp.json()["detail"]


# ── Bucketing (pure) ──────────────────────────────────────────────────────


def test_bucket_key_uses_iso_weeks_monday_start() -> None:
    # 2026-08-16 is a Sunday, 2026-08-17 the Monday after -- different ISO weeks.
    assert bucket_key(date(2026, 8, 16), "week") != bucket_key(date(2026, 8, 17), "week")
    assert bucket_key(date(2026, 8, 17), "week") == bucket_key(date(2026, 8, 23), "week")


def test_bucket_key_uses_the_iso_year_across_new_year() -> None:
    # 2026-12-31 (Thu) and 2027-01-01 (Fri) share ISO week 2026-W53.
    assert bucket_key(date(2026, 12, 31), "week") == "2026-W53"
    assert bucket_key(date(2027, 1, 1), "week") == "2026-W53"
    # Months split on the calendar boundary, unlike weeks.
    assert bucket_key(date(2026, 12, 31), "month") == "2026-12"
    assert bucket_key(date(2027, 1, 1), "month") == "2027-01"


def test_build_buckets_emits_empty_buckets() -> None:
    buckets = build_buckets("week", date(2026, 8, 3), date(2026, 8, 23), [], [])
    assert [b.key for b in buckets] == ["2026-W32", "2026-W33", "2026-W34"]
    assert all(b.total == 0 and b.avg_energy is None and b.avg_friction is None for b in buckets)
    assert buckets[0].start == date(2026, 8, 3) and buckets[0].end == date(2026, 8, 9)


def test_build_buckets_averages_only_rated_signals() -> None:
    """A row can rate one signal and leave the other unset (0).

    Averaging over every row in range would let the unset 0 drag the mean down.
    """
    days = [
        WorkLogDay(user_id=1, day=date(2026, 8, 17), energy=4, friction=0, note=""),
        WorkLogDay(user_id=1, day=date(2026, 8, 18), energy=0, friction=2, note="waiting on review"),
    ]
    bucket = build_buckets("week", date(2026, 8, 17), date(2026, 8, 23), [], days)[0]
    assert bucket.avg_energy == 4.0
    assert bucket.avg_friction == 2.0
    assert bucket.friction_notes == ["waiting on review"]


# ── Default range (the path the UI actually uses) ─────────────────────────


@pytest.mark.parametrize("period", ["week", "month"])
@pytest.mark.parametrize(
    "utc_today",
    [
        date(2026, 8, 20),  # mid-week, mid-month
        date(2026, 8, 23),  # Sunday: the week bucket ends today
        date(2026, 8, 31),  # last day of the month
        date(2026, 12, 31),  # last day of the ISO year
    ],
)
def test_default_range_covers_a_client_a_day_ahead(period: str, utc_today: date) -> None:
    """The browser sends no range, and stamps entries with its *local* day.

    At UTC+14 that day is ahead of ours, so a window ending on our own date would
    exclude the entry the user just wrote and report zero for it.
    """
    start, end = _default_rollup_range(period, utc_today)
    assert start <= utc_today
    assert end >= utc_today + timedelta(days=1)


@pytest.mark.parametrize("period", ["week", "month"])
async def test_rollup_without_a_range_includes_tomorrows_entry(client: AsyncTestClient, period: str) -> None:
    """End to end over the no-range path, using a day the server would call the future.

    A client at UTC+14 sends exactly this: a `day` one ahead of the server's date.
    """
    tomorrow = (datetime.now(UTC).date() + timedelta(days=1)).isoformat()
    await _create(client, day=tomorrow, title="logged from UTC+14")

    body = (await client.get(f"/api/worklog/rollup?period={period}")).json()
    titles = [e["title"] for b in body["buckets"] for e in b["entries"]]
    assert "logged from UTC+14" in titles


# ── Rollup endpoint ───────────────────────────────────────────────────────


async def test_rollup_counts_categories_links_and_impact(client: AsyncTestClient) -> None:
    await _create(
        client,
        day="2026-08-17",
        category="shipped",
        impact="p95 820ms -> 340ms",
        links=[
            {"url": "https://e.com/pull/1", "kind": "pr"},
            {"url": "https://e.com/rfc", "kind": "rfc"},
        ],
    )
    await _create(
        client, day="2026-08-18", category="glue", links=[{"url": "https://e.com/pull/2", "kind": "pr"}]
    )
    await _create(client, day="2026-08-18", category="learning")
    await client.put("/api/worklog/day", json={"day": "2026-08-17", "energy": 5, "friction": 1})

    resp = await client.get("/api/worklog/rollup?period=week&start=2026-08-17&end=2026-08-23")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["period"] == "week"
    assert len(body["buckets"]) == 1

    bucket = body["buckets"][0]
    assert bucket["key"] == "2026-W34"
    assert bucket["total"] == 3
    assert bucket["by_category"] == {"shipped": 1, "operational": 0, "glue": 1, "learning": 1}
    assert bucket["links_by_kind"] == {"pr": 2, "rfc": 1, "doc": 0, "incident": 0, "link": 0}
    assert bucket["with_impact"] == 1
    assert bucket["days_logged"] == 2
    assert bucket["avg_energy"] == 5.0
    assert bucket["avg_friction"] == 1.0
    assert [e["day"] for e in bucket["entries"]] == ["2026-08-17", "2026-08-18", "2026-08-18"]


async def test_rollup_splits_on_the_week_boundary(client: AsyncTestClient) -> None:
    await _create(client, day="2026-08-16", title="sunday")  # 2026-W33
    await _create(client, day="2026-08-17", title="monday")  # 2026-W34

    body = (await client.get("/api/worklog/rollup?period=week&start=2026-08-10&end=2026-08-23")).json()
    by_key = {b["key"]: b for b in body["buckets"]}
    assert [b["key"] for b in body["buckets"]] == ["2026-W33", "2026-W34"]
    assert [e["title"] for e in by_key["2026-W33"]["entries"]] == ["sunday"]
    assert [e["title"] for e in by_key["2026-W34"]["entries"]] == ["monday"]


async def test_rollup_splits_on_the_month_boundary(client: AsyncTestClient) -> None:
    await _create(client, day="2026-07-31", title="july")
    await _create(client, day="2026-08-01", title="august")

    body = (await client.get("/api/worklog/rollup?period=month&start=2026-07-01&end=2026-08-31")).json()
    assert [b["key"] for b in body["buckets"]] == ["2026-07", "2026-08"]
    assert [b["total"] for b in body["buckets"]] == [1, 1]
    assert body["buckets"][0]["start"] == "2026-07-01"
    assert body["buckets"][0]["end"] == "2026-07-31"


async def test_rollup_rejects_an_unknown_period(client: AsyncTestClient) -> None:
    resp = await client.get("/api/worklog/rollup?period=fortnight")
    assert resp.status_code == 400
    assert "period" in resp.json()["detail"]
