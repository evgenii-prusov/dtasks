from __future__ import annotations

from datetime import UTC, datetime

import pytest
from litestar.testing import AsyncTestClient

pytestmark = pytest.mark.anyio

ALL_WEEKDAYS = 0b1111111


def _today_bit() -> int:
    return 1 << datetime.now(UTC).date().weekday()


def _today_str() -> str:
    return datetime.now(UTC).date().isoformat()


async def _first_project_id(client: AsyncTestClient) -> int:
    projects = (await client.get("/api/projects")).json()
    return projects[0]["id"]


async def test_create_recurrence_returns_201(client: AsyncTestClient) -> None:
    project_id = await _first_project_id(client)
    resp = await client.post(
        f"/api/projects/{project_id}/recurrences",
        json={"title": "Water plants", "weekdays": ALL_WEEKDAYS, "complexity": "high", "is_green": True},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "Water plants"
    assert body["project_id"] == project_id
    assert body["complexity"] == "high"
    assert body["is_green"] is True
    assert body["weekdays"] == ALL_WEEKDAYS


async def test_create_recurrence_rejects_blank_title(client: AsyncTestClient) -> None:
    project_id = await _first_project_id(client)
    resp = await client.post(
        f"/api/projects/{project_id}/recurrences", json={"title": "   ", "weekdays": ALL_WEEKDAYS}
    )
    assert resp.status_code == 400


@pytest.mark.parametrize("weekdays", [0, 128, -1])
async def test_create_recurrence_rejects_invalid_weekday_mask(client: AsyncTestClient, weekdays: int) -> None:
    project_id = await _first_project_id(client)
    resp = await client.post(
        f"/api/projects/{project_id}/recurrences", json={"title": "Bad mask", "weekdays": weekdays}
    )
    assert resp.status_code == 400


async def test_recurrence_generates_todays_occurrence_on_list(client: AsyncTestClient) -> None:
    project_id = await _first_project_id(client)
    created = await client.post(
        f"/api/projects/{project_id}/recurrences",
        json={"title": "Daily standup", "weekdays": ALL_WEEKDAYS},
    )
    rule_id = created.json()["id"]

    projects = (await client.get("/api/projects")).json()
    project = next(p for p in projects if p["id"] == project_id)
    occurrences = [t for t in project["tasks"] if t["recurrence_rule_id"] == rule_id]

    assert len(occurrences) == 1
    occurrence = occurrences[0]
    assert occurrence["title"] == "Daily standup"
    assert occurrence["assigned_today"] is True
    assert occurrence["occurrence_date"] == _today_str()


async def test_relisting_same_day_does_not_duplicate_occurrence(client: AsyncTestClient) -> None:
    project_id = await _first_project_id(client)
    created = await client.post(
        f"/api/projects/{project_id}/recurrences",
        json={"title": "Daily standup", "weekdays": ALL_WEEKDAYS},
    )
    rule_id = created.json()["id"]

    await client.get("/api/projects")
    projects = (await client.get("/api/projects")).json()
    project = next(p for p in projects if p["id"] == project_id)
    occurrences = [t for t in project["tasks"] if t["recurrence_rule_id"] == rule_id]
    assert len(occurrences) == 1


async def test_rule_not_matching_today_does_not_generate(client: AsyncTestClient) -> None:
    project_id = await _first_project_id(client)
    off_today_mask = ALL_WEEKDAYS & ~_today_bit()
    created = await client.post(
        f"/api/projects/{project_id}/recurrences",
        json={"title": "Never today", "weekdays": off_today_mask},
    )
    rule_id = created.json()["id"]

    projects = (await client.get("/api/projects")).json()
    project = next(p for p in projects if p["id"] == project_id)
    occurrences = [t for t in project["tasks"] if t["recurrence_rule_id"] == rule_id]
    assert occurrences == []


async def test_deleting_occurrence_does_not_regenerate_same_day(client: AsyncTestClient) -> None:
    """Regression test: the naive 'does a live row exist' guard would resurrect a
    deleted occurrence on the very next refetch. The last_generated_date high-water
    mark must make delete-today behave as a real skip instead."""
    project_id = await _first_project_id(client)
    created = await client.post(
        f"/api/projects/{project_id}/recurrences",
        json={"title": "Daily standup", "weekdays": ALL_WEEKDAYS},
    )
    rule_id = created.json()["id"]

    projects = (await client.get("/api/projects")).json()
    project = next(p for p in projects if p["id"] == project_id)
    occurrence = next(t for t in project["tasks"] if t["recurrence_rule_id"] == rule_id)

    delete_resp = await client.delete(f"/api/tasks/{occurrence['id']}")
    assert delete_resp.status_code == 204

    projects_after = (await client.get("/api/projects")).json()
    project_after = next(p for p in projects_after if p["id"] == project_id)
    occurrences_after = [t for t in project_after["tasks"] if t["recurrence_rule_id"] == rule_id]
    assert occurrences_after == []


async def test_update_recurrence_does_not_change_already_generated_occurrence(
    client: AsyncTestClient,
) -> None:
    project_id = await _first_project_id(client)
    created = await client.post(
        f"/api/projects/{project_id}/recurrences",
        json={"title": "Old title", "weekdays": ALL_WEEKDAYS},
    )
    rule_id = created.json()["id"]

    projects = (await client.get("/api/projects")).json()
    project = next(p for p in projects if p["id"] == project_id)
    occurrence = next(t for t in project["tasks"] if t["recurrence_rule_id"] == rule_id)

    patched = await client.patch(f"/api/recurrences/{rule_id}", json={"title": "New title"})
    assert patched.status_code == 200
    assert patched.json()["title"] == "New title"

    projects_after = (await client.get("/api/projects")).json()
    project_after = next(p for p in projects_after if p["id"] == project_id)
    same_occurrence = next(t for t in project_after["tasks"] if t["id"] == occurrence["id"])
    assert same_occurrence["title"] == "Old title"


async def test_update_recurrence_rejects_invalid_weekday_mask(client: AsyncTestClient) -> None:
    project_id = await _first_project_id(client)
    created = await client.post(
        f"/api/projects/{project_id}/recurrences", json={"title": "Rule", "weekdays": ALL_WEEKDAYS}
    )
    rule_id = created.json()["id"]
    resp = await client.patch(f"/api/recurrences/{rule_id}", json={"weekdays": 0})
    assert resp.status_code == 400


async def test_delete_recurrence_preserves_generated_occurrence(client: AsyncTestClient) -> None:
    project_id = await _first_project_id(client)
    created = await client.post(
        f"/api/projects/{project_id}/recurrences",
        json={"title": "Daily standup", "weekdays": ALL_WEEKDAYS},
    )
    rule_id = created.json()["id"]

    projects = (await client.get("/api/projects")).json()
    project = next(p for p in projects if p["id"] == project_id)
    occurrence = next(t for t in project["tasks"] if t["recurrence_rule_id"] == rule_id)

    delete_resp = await client.delete(f"/api/recurrences/{rule_id}")
    assert delete_resp.status_code == 204

    projects_after = (await client.get("/api/projects")).json()
    project_after = next(p for p in projects_after if p["id"] == project_id)
    still_there = next(t for t in project_after["tasks"] if t["id"] == occurrence["id"])
    assert still_there["title"] == "Daily standup"
    assert still_there["recurrence_rule_id"] is None

    assert all(r["id"] != rule_id for r in project_after["recurrences"])


async def test_delete_missing_recurrence_returns_404(client: AsyncTestClient) -> None:
    resp = await client.delete("/api/recurrences/999999")
    assert resp.status_code == 404
