from __future__ import annotations

import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import create_async_engine

from app import db as app_db

pytestmark = pytest.mark.anyio


async def test_sqlite_pragmas_applied_on_connect(tmp_path) -> None:
    """Every new DBAPI connection should get WAL journaling and FK enforcement.

    Builds a throwaway engine the same way app.db does (including connect_args
    timeout for busy_timeout behavior) and wires up the same connect listener,
    then asserts the pragmas took effect.
    """
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'pragma_test.sqlite'}",
        connect_args={"timeout": 30},
    )
    event.listens_for(engine.sync_engine, "connect")(app_db.set_sqlite_pragmas)
    try:
        async with engine.connect() as conn:
            journal_mode = (await conn.execute(text("PRAGMA journal_mode"))).scalar()
            foreign_keys = (await conn.execute(text("PRAGMA foreign_keys"))).scalar()
        assert journal_mode == "wal"
        assert foreign_keys == 1
    finally:
        await engine.dispose()


async def test_wal_sidecar_files_created_on_write(tmp_path) -> None:
    """A write under WAL mode should produce -wal/-shm sidecar files next to the db."""
    db_path = tmp_path / "wal_sidecar_test.sqlite"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"timeout": 30},
    )
    event.listens_for(engine.sync_engine, "connect")(app_db.set_sqlite_pragmas)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY)"))
            await conn.execute(text("INSERT INTO t (id) VALUES (1)"))
        assert db_path.with_name(db_path.name + "-wal").exists()
        assert db_path.with_name(db_path.name + "-shm").exists()
    finally:
        await engine.dispose()


async def test_app_engine_has_pragma_listener_registered() -> None:
    """The module-level app.db.engine should have the pragma listener wired up."""
    assert event.contains(app_db.engine.sync_engine, "connect", app_db.set_sqlite_pragmas)
