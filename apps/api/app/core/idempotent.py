"""Runs a mutation once per `Idempotency-Key` (api-contracts.md §1). HTTP glue for routers."""

from collections.abc import Awaitable, Callable

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.errors import ValidationFailed
from app.core.idempotency import MAX_KEY_LENGTH, IdempotencyStore
from app.modules.users.models import User


async def run_once(
    store: IdempotencyStore,
    user: User,
    operation: str,
    key: str | None,
    status: int,
    action: Callable[[], Awaitable[BaseModel]],
) -> JSONResponse:
    """Without a key, just runs. With one, a repeat returns the first successful response unchanged."""
    if key is not None and not 0 < len(key) <= MAX_KEY_LENGTH:
        raise ValidationFailed(details={"fields": {"Idempotency-Key": ["Use 1 to 100 characters."]}})
    if key:
        stored = await store.get(user.id, operation, key)
        if stored is not None:
            return JSONResponse(stored.body, status_code=stored.status, headers={"Idempotent-Replay": "true"})
    body = jsonable_encoder(await action(), by_alias=True)
    if key:
        await store.save(user.id, operation, key, status, body)
    return JSONResponse(body, status_code=status)
