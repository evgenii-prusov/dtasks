from __future__ import annotations

import pytest
from litestar.testing import AsyncTestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import Task

pytestmark = pytest.mark.anyio


async def test_delete_project_removes_it_and_cascades_tasks(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    projects = (await client.get("/api/projects")).json()
    target = next(p for p in projects if p["tasks"])
    project_id = target["id"]

    resp = await client.delete(f"/api/projects/{project_id}")
    assert resp.status_code == 204

    after = (await client.get("/api/projects")).json()
    assert len(after) == len(projects) - 1
    assert all(p["id"] != project_id for p in after)

    # Tasks belonging to the project are cascade-deleted (no orphans left).
    async with db() as session:
        orphan_tasks = (
            await session.execute(select(func.count()).select_from(Task).where(Task.project_id == project_id))
        ).scalar()
    assert orphan_tasks == 0


async def test_delete_missing_project_returns_404(client: AsyncTestClient) -> None:
    resp = await client.delete("/api/projects/999999")
    assert resp.status_code == 404


async def test_create_project_adds_it_to_the_list(client: AsyncTestClient) -> None:
    before = (await client.get("/api/projects")).json()

    resp = await client.post("/api/projects", json={"name": "New Project", "group": "Personal"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "New Project"
    assert body["group"] == "Personal"
    assert body["tasks"] == []

    after = (await client.get("/api/projects")).json()
    assert len(after) == len(before) + 1
    assert any(p["id"] == body["id"] for p in after)


async def test_create_project_defaults_group_to_work(client: AsyncTestClient) -> None:
    resp = await client.post("/api/projects", json={"name": "No Group Given"})
    assert resp.status_code == 201
    assert resp.json()["group"] == "Work"


async def test_create_project_rejects_blank_name(client: AsyncTestClient) -> None:
    resp = await client.post("/api/projects", json={"name": "   ", "group": "Work"})
    assert resp.status_code == 400


async def test_reorder_projects(client: AsyncTestClient) -> None:
    # Create two projects in Personal group
    resp1 = await client.post("/api/projects", json={"name": "P1", "group": "Personal"})
    assert resp1.status_code == 201
    p1 = resp1.json()

    resp2 = await client.post("/api/projects", json={"name": "P2", "group": "Personal"})
    assert resp2.status_code == 201
    p2 = resp2.json()

    # Verify their initial relative positions
    projects = (await client.get("/api/projects")).json()
    personal_projects = [p for p in projects if p["group"] == "Personal"]
    idx1 = next(idx for idx, p in enumerate(personal_projects) if p["id"] == p1["id"])
    idx2 = next(idx for idx, p in enumerate(personal_projects) if p["id"] == p2["id"])
    assert idx1 < idx2

    # Reorder P2 up (should swap P2 and P1)
    resp = await client.post(f"/api/projects/{p2['id']}/reorder", json={"direction": "up"})
    assert resp.status_code == 201
    updated_projects = resp.json()
    personal_projects_after = [p for p in updated_projects if p["group"] == "Personal"]

    idx1_after = next(idx for idx, p in enumerate(personal_projects_after) if p["id"] == p1["id"])
    idx2_after = next(idx for idx, p in enumerate(personal_projects_after) if p["id"] == p2["id"])
    assert idx2_after < idx1_after

    # Reorder P2 up again (swaps with German Driving License)
    resp = await client.post(f"/api/projects/{p2['id']}/reorder", json={"direction": "up"})
    assert resp.status_code == 201

    # Reorder P2 up again (swaps with '...')
    resp = await client.post(f"/api/projects/{p2['id']}/reorder", json={"direction": "up"})
    assert resp.status_code == 201
    personal_projects_noop = [p for p in resp.json() if p["group"] == "Personal"]
    idx2_noop = next(idx for idx, p in enumerate(personal_projects_noop) if p["id"] == p2["id"])
    assert idx2_noop == 0

    # Try to reorder P2 up again (should be a no-op as it's already first in group)
    resp = await client.post(f"/api/projects/{p2['id']}/reorder", json={"direction": "up"})
    assert resp.status_code == 201
    personal_projects_noop2 = [p for p in resp.json() if p["group"] == "Personal"]
    idx2_noop2 = next(idx for idx, p in enumerate(personal_projects_noop2) if p["id"] == p2["id"])
    assert idx2_noop2 == 0

    # Try invalid direction
    resp = await client.post(f"/api/projects/{p2['id']}/reorder", json={"direction": "left"})
    assert resp.status_code == 400


async def test_default_projects_exist_by_default(client: AsyncTestClient) -> None:
    projects = (await client.get("/api/projects")).json()
    work_default = next((p for p in projects if p["name"] == "..." and p["group"] == "Work"), None)
    personal_default = next((p for p in projects if p["name"] == "..." and p["group"] == "Personal"), None)
    assert work_default is not None
    assert personal_default is not None


async def test_cannot_delete_or_rename_default_projects(client: AsyncTestClient) -> None:
    projects = (await client.get("/api/projects")).json()
    work_default = next(p for p in projects if p["name"] == "..." and p["group"] == "Work")

    # Attempt rename
    resp = await client.patch(f"/api/projects/{work_default['id']}", json={"name": "New Name"})
    assert resp.status_code == 400
    assert "cannot be renamed" in resp.json()["detail"]

    # Attempt delete
    resp = await client.delete(f"/api/projects/{work_default['id']}")
    assert resp.status_code == 400
    assert "cannot be deleted" in resp.json()["detail"]


async def test_cannot_create_reserved_name_project(client: AsyncTestClient) -> None:
    resp = await client.post("/api/projects", json={"name": "...", "group": "Work"})
    assert resp.status_code == 400
    assert "reserved for default projects" in resp.json()["detail"]
