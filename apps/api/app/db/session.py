"""Async engine (asyncpg) and one session per request.

The engine is created in the app's lifespan (`app.main`) and kept on `app.state`, so every
app instance, and every test's app, owns its own connection pool and event loop.
"""

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine


def create_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(database_url, pool_pre_ping=True)


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: services return ORM objects after their transaction commits.
    return async_sessionmaker(engine, expire_on_commit=False)
