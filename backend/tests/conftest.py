from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from litestar.testing import AsyncTestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import main


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def db(monkeypatch: pytest.MonkeyPatch, tmp_path) -> AsyncIterator[async_sessionmaker]:
    """Point the app at a throwaway SQLite file so tests never touch real data.

    The app's lifespan reads ``main.engine`` / ``main.session_factory`` at call
    time, so patching them here makes the whole HTTP stack use the temp DB.
    """
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.sqlite'}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main, "session_factory", session_factory)
    yield session_factory
    await engine.dispose()


@pytest.fixture
async def client(db: async_sessionmaker) -> AsyncIterator[AsyncTestClient]:
    """AsyncTestClient whose lifespan creates tables and seeds the temp DB."""
    async with AsyncTestClient(app=main.app) as client:
        yield client
