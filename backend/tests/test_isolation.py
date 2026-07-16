from __future__ import annotations

import pytest
from conftest import MakeClient

pytestmark = pytest.mark.anyio


async def test_lists_are_scoped(make_client: MakeClient) -> None:
    a = await make_client("a@example.com")
    b = await make_client("b@example.com")

    a_projects = (await a.get("/api/projects")).json()
    b_projects = (await b.get("/api/projects")).json()
    assert len(a_projects) == 6
    assert len(b_projects) == 6
    a_project_ids = {p["id"] for p in a_projects}
    b_project_ids = {p["id"] for p in b_projects}
    assert a_project_ids.isdisjoint(b_project_ids)

    a_habits = (await a.get("/api/habits")).json()
    b_habits = (await b.get("/api/habits")).json()
    assert len(a_habits) == 4
    assert len(b_habits) == 4
    a_habit_ids = {h["id"] for h in a_habits}
    b_habit_ids = {h["id"] for h in b_habits}
    assert a_habit_ids.isdisjoint(b_habit_ids)


async def test_cross_tenant_project_404(make_client: MakeClient) -> None:
    a = await make_client("a@example.com")
    b = await make_client("b@example.com")

    a_project_id = (await a.get("/api/projects")).json()[0]["id"]

    # No single-project GET endpoint exists (only list/patch/delete); exercise
    # the endpoints that actually take a project id.
    patch_missing = await b.patch("/api/projects/999999", json={"name": "hack"})
    patch_real = await b.patch(f"/api/projects/{a_project_id}", json={"name": "hack"})
    assert patch_real.status_code == 404
    assert patch_real.json() == patch_missing.json()

    delete_missing = await b.delete("/api/projects/999999")
    delete_real = await b.delete(f"/api/projects/{a_project_id}")
    assert delete_real.status_code == 404
    assert delete_real.json() == delete_missing.json()


async def test_cross_tenant_task_404(make_client: MakeClient) -> None:
    a = await make_client("a@example.com")
    b = await make_client("b@example.com")

    a_projects = (await a.get("/api/projects")).json()
    a_project_with_tasks = next(p for p in a_projects if p["tasks"])
    a_project_id = a_project_with_tasks["id"]
    a_task_id = a_project_with_tasks["tasks"][0]["id"]

    before = (await a.get("/api/projects")).json()

    patch_missing = await b.patch("/api/tasks/999999", json={"title": "hacked"})
    patch_real = await b.patch(f"/api/tasks/{a_task_id}", json={"title": "hacked"})
    assert patch_real.status_code == 404
    assert patch_real.json() == patch_missing.json()

    delete_missing = await b.delete("/api/tasks/999999")
    delete_real = await b.delete(f"/api/tasks/{a_task_id}")
    assert delete_real.status_code == 404
    assert delete_real.json() == delete_missing.json()

    reorder_missing = await b.post("/api/tasks/999999/reorder", json={"direction": "up"})
    reorder_real = await b.post(f"/api/tasks/{a_task_id}/reorder", json={"direction": "up"})
    assert reorder_real.status_code == 404
    assert reorder_real.json() == reorder_missing.json()

    create_missing = await b.post("/api/projects/999999/tasks", json={"title": "hacked task"})
    create_real = await b.post(f"/api/projects/{a_project_id}/tasks", json={"title": "hacked task"})
    assert create_real.status_code == 404
    assert create_real.json() == create_missing.json()

    after = (await a.get("/api/projects")).json()
    assert after == before


async def test_cross_tenant_habit_404(make_client: MakeClient) -> None:
    a = await make_client("a@example.com")
    b = await make_client("b@example.com")

    a_habit_id = (await a.get("/api/habits")).json()[0]["id"]

    missing = await b.put("/api/habits/999999/log", json={"day": "2026-07-03", "state": 2})
    real = await b.put(f"/api/habits/{a_habit_id}/log", json={"day": "2026-07-03", "state": 2})
    assert real.status_code == 404
    assert real.json() == missing.json()

    delete_missing = await b.delete("/api/habits/999999")
    delete_real = await b.delete(f"/api/habits/{a_habit_id}")
    assert delete_real.status_code == 404
    assert delete_real.json() == delete_missing.json()

    a_habits_after = (await a.get("/api/habits")).json()
    assert any(h["id"] == a_habit_id for h in a_habits_after)


async def test_habit_creation_is_scoped_to_creating_user(make_client: MakeClient) -> None:
    a = await make_client("a@example.com")
    b = await make_client("b@example.com")

    created = await a.post("/api/habits", json={"name": "A's new habit"})
    assert created.status_code == 201
    new_habit_id = created.json()["id"]

    a_habits = (await a.get("/api/habits")).json()
    b_habits = (await b.get("/api/habits")).json()
    assert any(h["id"] == new_habit_id for h in a_habits)
    assert all(h["id"] != new_habit_id for h in b_habits)


async def test_must_have_limit_is_per_user(make_client: MakeClient) -> None:
    a = await make_client("a@example.com")
    b = await make_client("b@example.com")

    # b stays at its (maxed) starter limit throughout.
    b_projects = (await b.get("/api/projects")).json()
    b_tasks = [t for p in b_projects for t in p["tasks"]]
    b_non_must_have = next(t for t in b_tasks if not t["must_have"])
    b_at_limit = await b.patch(f"/api/tasks/{b_non_must_have['id']}", json={"must_have": True})
    assert b_at_limit.status_code == 409

    a_projects = (await a.get("/api/projects")).json()
    a_tasks = [t for p in a_projects for t in p["tasks"]]
    a_must_haves = [t for t in a_tasks if t["must_have"]]
    a_non_must_have = next(t for t in a_tasks if not t["must_have"])
    assert len(a_must_haves) == 2

    # A unsets one of theirs, then successfully sets a different one, even
    # while B independently sits at the limit.
    unset = await a.patch(f"/api/tasks/{a_must_haves[0]['id']}", json={"must_have": False})
    assert unset.status_code == 200

    set_new = await a.patch(f"/api/tasks/{a_non_must_have['id']}", json={"must_have": True})
    assert set_new.status_code == 200

    # A is now back at the limit (2 active must-haves): the remaining
    # original must-have plus the newly set one.
    still_at_limit = await a.patch(f"/api/tasks/{a_must_haves[0]['id']}", json={"must_have": True})
    assert still_at_limit.status_code == 409


async def test_project_positions_are_per_user(make_client: MakeClient) -> None:
    a = await make_client("a@example.com")
    b = await make_client("b@example.com")

    a_new = await a.post("/api/projects", json={"name": "A New Project"})
    b_new = await b.post("/api/projects", json={"name": "B New Project"})

    assert a_new.json()["position"] == 6
    assert b_new.json()["position"] == 6
