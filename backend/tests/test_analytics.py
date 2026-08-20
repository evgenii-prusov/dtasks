from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import pytest
from conftest import MakeClient
from litestar.testing import AsyncTestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.analytics import MAX_BATCH, sanitize_props
from app.models import Event

pytestmark = pytest.mark.anyio


async def _events(
    db: async_sessionmaker, name: str | None = None, *, include_auth: bool = False
) -> list[Event]:
    """Events in insertion order.

    Auth events are excluded by default: the `client` fixture signs up, so every
    test would otherwise have to account for that one row.
    """
    async with db() as session:
        stmt = select(Event).order_by(Event.id)
        if name is not None:
            stmt = stmt.where(Event.name == name)
        elif not include_auth:
            stmt = stmt.where(Event.name.not_like("auth.%"))
        return list((await session.execute(stmt)).scalars().all())


async def _first_project_id(client: AsyncTestClient) -> int:
    resp = await client.get("/api/projects")
    return resp.json()[0]["id"]


def _client_event(name: str, **overrides) -> dict:
    payload = {
        "event_id": str(uuid.uuid4()),
        "name": name,
        "occurred_at": datetime.now(UTC).isoformat(),
        "session_id": "sess-1",
        "input": "keyboard",
    }
    payload.update(overrides)
    return payload


# ── Middleware: CRUD ground truth ─────────────────────────────────────────


async def test_create_task_is_recorded(client: AsyncTestClient, db: async_sessionmaker) -> None:
    project_id = await _first_project_id(client)
    resp = await client.post(f"/api/projects/{project_id}/tasks", json={"title": "Write it down"})
    assert resp.status_code == 201, resp.text

    events = await _events(db, "task.create")
    assert len(events) == 1
    assert events[0].source == "api"
    assert events[0].entity_type == "task"
    # The path id is the parent project, so it is a prop rather than entity_id.
    assert events[0].entity_id is None
    assert json.loads(events[0].props)["project_id"] == project_id


async def test_update_task_records_which_fields_changed(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    project_id = await _first_project_id(client)
    task_id = (await client.post(f"/api/projects/{project_id}/tasks", json={"title": "t"})).json()["id"]

    await client.patch(f"/api/tasks/{task_id}", json={"completed": True})

    events = await _events(db, "task.update")
    assert len(events) == 1
    assert events[0].entity_id == task_id
    props = json.loads(events[0].props)
    assert props["fields"] == ["completed"]
    assert props["ok"] is True


async def test_rejected_must_have_is_still_recorded(client: AsyncTestClient, db: async_sessionmaker) -> None:
    """Friction is the point: hitting the 2-task limit must not vanish from the record."""
    project_id = await _first_project_id(client)

    # The starter data already ships 2 must-haves, so clear them to own the state.
    for project in (await client.get("/api/projects")).json():
        for task in project["tasks"]:
            if task["must_have"] and not task["completed"]:
                await client.patch(f"/api/tasks/{task['id']}", json={"must_have": False})

    ids = [
        (await client.post(f"/api/projects/{project_id}/tasks", json={"title": f"t{i}"})).json()["id"]
        for i in range(3)
    ]
    for task_id in ids[:2]:
        assert (await client.patch(f"/api/tasks/{task_id}", json={"must_have": True})).status_code == 200

    resp = await client.patch(f"/api/tasks/{ids[2]}", json={"must_have": True})
    assert resp.status_code == 409

    rejected = json.loads((await _events(db, "task.update"))[-1].props)
    assert rejected["status"] == 409
    assert rejected["ok"] is False
    assert rejected["fields"] == ["must_have"]


async def test_get_requests_are_not_recorded(client: AsyncTestClient, db: async_sessionmaker) -> None:
    await client.get("/api/projects")
    await client.get("/api/habits")
    assert await _events(db) == []


async def test_signup_is_attributed_to_the_new_user(
    anon_client: AsyncTestClient, db: async_sessionmaker
) -> None:
    """Auth happens during the handler, so the user id has to come from the session."""
    await anon_client.post(
        "/api/auth/signup",
        json={"email": "new@example.com", "password": "password123", "invite_code": "test-invite-code"},
    )
    events = await _events(db, "auth.signup")
    assert len(events) == 1
    assert events[0].user_id is not None


# ── Modality: the mouse -> keyboard migration ─────────────────────────────


async def test_input_header_is_recorded(client: AsyncTestClient, db: async_sessionmaker) -> None:
    project_id = await _first_project_id(client)
    await client.post(
        f"/api/projects/{project_id}/tasks",
        json={"title": "typed"},
        headers={"X-DTask-Input": "keyboard"},
    )
    events = await _events(db, "task.create")
    assert events[0].input == "keyboard"


async def test_missing_or_bogus_input_becomes_unknown(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    project_id = await _first_project_id(client)
    await client.post(f"/api/projects/{project_id}/tasks", json={"title": "a"})
    await client.post(
        f"/api/projects/{project_id}/tasks",
        json={"title": "b"},
        headers={"X-DTask-Input": "telepathy"},
    )
    assert [e.input for e in await _events(db, "task.create")] == ["unknown", "unknown"]


async def test_both_paths_of_one_action_share_an_event_name(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    """The acceptance test for the primary goal.

    Completing a task by click and by keypress must produce the same event name
    and the same shape, differing only in ``input`` -- otherwise keyboard share
    is not a computable ratio.
    """
    project_id = await _first_project_id(client)
    ids = [
        (await client.post(f"/api/projects/{project_id}/tasks", json={"title": f"t{i}"})).json()["id"]
        for i in range(2)
    ]

    await client.patch(f"/api/tasks/{ids[0]}", json={"completed": True}, headers={"X-DTask-Input": "mouse"})
    await client.patch(
        f"/api/tasks/{ids[1]}", json={"completed": True}, headers={"X-DTask-Input": "keyboard"}
    )

    completions = [
        e for e in await _events(db, "task.update") if json.loads(e.props)["fields"] == ["completed"]
    ]
    assert len(completions) == 2
    assert {e.input for e in completions} == {"mouse", "keyboard"}
    # Same name, same entity type: one population, sliceable by modality.
    assert {e.name for e in completions} == {"task.update"}
    assert {e.entity_type for e in completions} == {"task"}

    keyboard_share = sum(e.input == "keyboard" for e in completions) / len(completions)
    assert keyboard_share == 0.5


async def test_surface_header_is_recorded_and_validated(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    project_id = await _first_project_id(client)
    await client.post(
        f"/api/projects/{project_id}/tasks", json={"title": "a"}, headers={"X-DTask-Surface": "plan"}
    )
    await client.post(
        f"/api/projects/{project_id}/tasks", json={"title": "b"}, headers={"X-DTask-Surface": "nonsense"}
    )
    assert [e.surface for e in await _events(db, "task.create")] == ["plan", None]


async def test_worklog_mutations_are_recorded(client: AsyncTestClient, db: async_sessionmaker) -> None:
    """ROUTE_EVENTS is a silent-failure path: a route missing from it records
    nothing, with no error and no other failing test."""
    created = await client.post(
        "/api/worklog/entries",
        json={"day": "2026-08-19", "category": "shipped", "title": "Shipped it"},
        headers={"X-DTask-Surface": "worklog"},
    )
    assert created.status_code == 201, created.text
    entry_id = created.json()["id"]

    await client.patch(f"/api/worklog/entries/{entry_id}", json={"title": "Shipped it well"})
    await client.put("/api/worklog/day", json={"day": "2026-08-19", "energy": 4})
    await client.delete(f"/api/worklog/entries/{entry_id}")

    create_events = await _events(db, "worklog.entry.create")
    assert len(create_events) == 1
    assert create_events[0].entity_type == "worklog_entry"
    # "worklog" must be in SURFACES, or _clean_surface() nulls it silently.
    assert create_events[0].surface == "worklog"
    # No id in the path, so nothing to attribute -- and no null prop invented.
    assert create_events[0].entity_id is None
    assert "project_id" not in json.loads(create_events[0].props)

    assert [e.entity_id for e in await _events(db, "worklog.entry.update")] == [entry_id]
    assert [e.entity_id for e in await _events(db, "worklog.entry.delete")] == [entry_id]

    day_events = await _events(db, "worklog.day.set")
    assert len(day_events) == 1
    assert day_events[0].entity_type == "worklog_day"


async def test_worklog_rollup_reads_are_not_recorded(client: AsyncTestClient, db: async_sessionmaker) -> None:
    await client.get("/api/worklog/rollup?period=week")
    await client.get("/api/worklog/entries?start=2026-08-01&end=2026-08-31")
    assert await _events(db, "worklog.rollup.view") == []


# ── Ingest endpoint ───────────────────────────────────────────────────────


async def test_ingest_accepts_a_batch(client: AsyncTestClient, db: async_sessionmaker) -> None:
    resp = await client.post(
        "/api/events",
        json={
            "events": [
                _client_event("hotkey.use", props={"name": "goPlan", "chord": "g p"}),
                _client_event("nav.view", props={"to": "/plan", "via": "hotkey"}),
            ]
        },
    )
    assert resp.status_code == 204, resp.text

    events = await _events(db)
    assert [e.name for e in events] == ["hotkey.use", "nav.view"]
    assert all(e.source == "web" and e.input == "keyboard" for e in events)
    assert json.loads(events[0].props)["chord"] == "g p"


async def test_ingest_is_idempotent_on_event_id(client: AsyncTestClient, db: async_sessionmaker) -> None:
    """A flush that fails after writing must not double count when it retries."""
    event = _client_event("undo.used")
    for _ in range(2):
        assert (await client.post("/api/events", json={"events": [event]})).status_code == 204
    assert len(await _events(db)) == 1


async def test_ingest_rejects_unknown_names(client: AsyncTestClient, db: async_sessionmaker) -> None:
    resp = await client.post("/api/events", json={"events": [_client_event("something.invented")]})
    assert resp.status_code == 400
    assert await _events(db) == []


async def test_ingest_rejects_forged_server_side_names(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    """CRUD names are the server's to emit; a browser must not be able to fake one."""
    resp = await client.post("/api/events", json={"events": [_client_event("task.create")]})
    assert resp.status_code == 400
    assert await _events(db) == []


async def test_ingest_rejects_oversized_batches(client: AsyncTestClient, db: async_sessionmaker) -> None:
    events = [_client_event("nav.view") for _ in range(MAX_BATCH + 1)]
    resp = await client.post("/api/events", json={"events": events})
    assert resp.status_code == 400
    assert await _events(db) == []


async def test_ingest_requires_a_session(anon_client: AsyncTestClient) -> None:
    resp = await anon_client.post("/api/events", json={"events": [_client_event("nav.view")]})
    assert resp.status_code == 401


async def test_ingest_does_not_record_itself(client: AsyncTestClient, db: async_sessionmaker) -> None:
    await client.post("/api/events", json={"events": [_client_event("nav.view")]})
    assert [e.name for e in await _events(db)] == ["nav.view"]


async def test_events_are_user_scoped(make_client: MakeClient, db: async_sessionmaker) -> None:
    alice = await make_client("alice@example.com")
    bob = await make_client("bob@example.com")
    await alice.post("/api/events", json={"events": [_client_event("nav.view")]})
    await bob.post("/api/events", json={"events": [_client_event("undo.used")]})

    by_name = {e.name: e.user_id for e in await _events(db)}
    assert by_name["nav.view"] != by_name["undo.used"]


# ── Privacy: free text must not survive ───────────────────────────────────


async def test_long_strings_are_truncated_not_stored_whole(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    title = "a project name that is far too long to belong in an analytics table " * 5
    await client.post("/api/events", json={"events": [_client_event("search.query", props={"q": title})]})
    stored = json.loads((await _events(db))[0].props)["q"]
    assert len(stored) == 64
    assert stored != title


def test_sanitize_props_keeps_only_scalars() -> None:
    out = json.loads(
        sanitize_props(
            {
                "count": 3,
                "ok": True,
                "ratio": 0.5,
                "fields": ["completed", "must_have"],
                "nested": {"leak": "a task title"},
                "objects": [{"leak": 1}],
                "nothing": None,
            }
        )
    )
    assert out["count"] == 3
    assert out["ok"] is True
    assert out["fields"] == ["completed", "must_have"]
    assert out["nothing"] is None
    # Nested structures are where free text would hide.
    assert "nested" not in out
    assert "objects" not in out


def test_sanitize_props_caps_key_count() -> None:
    out = json.loads(sanitize_props({f"k{i}": i for i in range(50)}))
    assert len(out) <= 12


def test_sanitize_props_returns_none_for_empty() -> None:
    assert sanitize_props({}) is None
    assert sanitize_props(None) is None
