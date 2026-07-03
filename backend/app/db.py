from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "jedi_tracker.sqlite"
DB_PATH = Path(os.environ.get("DTASKS_DB_PATH", str(_DEFAULT_DB_PATH)))

engine = create_async_engine(f"sqlite+aiosqlite:///{DB_PATH}")
session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def provide_session() -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        yield session
