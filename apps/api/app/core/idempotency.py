"""`Idempotency-Key` replays (api-contracts.md §1): accept, confirm (and pay, in B5).

A successful response is stored in Redis for IDEMPOTENCY_TTL_HOURS under the caller, the operation and
the key; a retry with the same key gets the stored response instead of a second effect. Failures aren't
stored, so a retry after an error runs again. Concurrent duplicates are still safe: the second one meets
the first one's changes (the proposal is no longer pending, the placement is no longer on trial).
"""

import json
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from redis.asyncio import Redis

MAX_KEY_LENGTH = 100


@dataclass(frozen=True)
class StoredResponse:
    status: int
    body: Any


class IdempotencyStore:
    def __init__(self, redis: Redis, ttl: timedelta) -> None:
        self._redis = redis
        self._ttl = ttl

    @staticmethod
    def _key(user_id: uuid.UUID, operation: str, key: str) -> str:
        return f"idem:{user_id}:{operation}:{key}"

    async def get(self, user_id: uuid.UUID, operation: str, key: str) -> StoredResponse | None:
        raw = await self._redis.get(self._key(user_id, operation, key))
        if raw is None:
            return None
        data = json.loads(raw)
        return StoredResponse(status=data["status"], body=data["body"])

    async def save(self, user_id: uuid.UUID, operation: str, key: str, status: int, body: Any) -> None:
        payload = json.dumps({"status": status, "body": body})
        await self._redis.set(self._key(user_id, operation, key), payload, ex=self._ttl, nx=True)
