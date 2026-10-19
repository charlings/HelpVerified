"""Async engine (asyncpg) and one session per request.

The engine is created in the app's lifespan (`app.main`) and kept on `app.state`, so every
app instance, and every test's app, owns its own connection pool and event loop.

A locking read (`SELECT ... FOR UPDATE`) always refreshes the objects it returns. Without that, SQLAlchemy's
identity map hands back the copy loaded before the lock was granted, so a transaction that waited for another
to commit would decide on stale state (found by tests/concurrency/test_payment_races.py: two settlements of
one payment, the second overwriting the first's result).
"""

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import ORMExecuteState, Session


@event.listens_for(Session, "do_orm_execute")
def _refresh_locked_rows(state: ORMExecuteState) -> None:
    if state.is_select and getattr(state.statement, "_for_update_arg", None) is not None:
        state.update_execution_options(populate_existing=True)


def create_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(database_url, pool_pre_ping=True)


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: services return ORM objects after their transaction commits.
    return async_sessionmaker(engine, expire_on_commit=False)
