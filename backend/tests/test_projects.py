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
            await session.execute(
                select(func.count()).select_from(Task).where(Task.project_id == project_id)
            )
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
