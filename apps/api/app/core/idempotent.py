"""Runs a mutation once per `Idempotency-Key` (api-contracts.md §1). HTTP glue for routers.

A key identifies one user action, reused only for automatic retries of it (ADR 0017, replay rule). Before a
stored response is replayed, `replay` may check it's still true (for accept and /pay: the hold is live and the
checkout still open); it returns a response to send instead, or None to replay the stored one.
"""

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.errors import ValidationFailed
from app.core.idempotency import MAX_KEY_LENGTH, IdempotencyStore
from app.modules.users.models import User

REPLAY_HEADER = {"Idempotent-Replay": "true"}


async def run_once(
    store: IdempotencyStore,
    user: User,
    operation: str,
    key: str | None,
    status: int,
    action: Callable[[], Awaitable[BaseModel]],
    replay: Callable[[Any], Awaitable[JSONResponse | None]] | None = None,
) -> JSONResponse:
    """Without a key, just runs. With one, a repeat returns the first successful response, after `replay`
    has confirmed it still holds."""
    if key is not None and not 0 < len(key) <= MAX_KEY_LENGTH:
        raise ValidationFailed(details={"fields": {"Idempotency-Key": ["Use 1 to 100 characters."]}})
    if key:
        stored = await store.get(user.id, operation, key)
        if stored is not None:
            override = await replay(stored.body) if replay else None
            if override is not None:
                return override
            return JSONResponse(stored.body, status_code=stored.status, headers=REPLAY_HEADER)
    body = jsonable_encoder(await action(), by_alias=True)
    if key:
        await store.save(user.id, operation, key, status, body)
    return JSONResponse(body, status_code=status)


async def fresh_replay(status: int, action: Callable[[], Awaitable[BaseModel]]) -> JSONResponse:
    """The same action resumed (never repeated): its current result, marked as a replay."""
    return JSONResponse(
        jsonable_encoder(await action(), by_alias=True), status_code=status, headers=REPLAY_HEADER
    )
