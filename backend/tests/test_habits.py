from __future__ import annotations

import pytest
from litestar.testing import AsyncTestClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import HabitLog

pytestmark = pytest.mark.anyio


async def test_delete_habit_removes_it_and_cascades_logs(
    client: AsyncTestClient, db: async_sessionmaker
) -> None:
    habits = (await client.get("/api/habits")).json()
    target = habits[0]
    habit_id = target["id"]

    logged = await client.put(
        f"/api/habits/{habit_id}/log", json={"day": "2026-07-03", "state": 2}
    )
    assert logged.status_code == 200

    resp = await client.delete(f"/api/habits/{habit_id}")
    assert resp.status_code == 204

    after = (await client.get("/api/habits")).json()
    assert len(after) == len(habits) - 1
    assert all(h["id"] != habit_id for h in after)

    # Logs belonging to the habit are cascade-deleted (no orphans left).
    async with db() as session:
        orphan_logs = (
            await session.execute(
                select(func.count()).select_from(HabitLog).where(HabitLog.habit_id == habit_id)
            )
        ).scalar()
    assert orphan_logs == 0


async def test_delete_missing_habit_returns_404(client: AsyncTestClient) -> None:
    resp = await client.delete("/api/habits/999999")
    assert resp.status_code == 404