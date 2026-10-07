"""Redis sliding-window rate limits (backend.md §9).

Each hit is a member of a sorted set scored by time. A Lua script trims the window,
checks the count and records the hit atomically, so concurrent requests can't
slip past the limit. Rejected hits are not recorded: once the oldest hit leaves the
window, the caller can try again (that's the `Retry-After` we return).
"""

import hashlib
import math
import uuid
from datetime import timedelta

from redis.asyncio import Redis

from app.core.clock import utcnow
from app.core.errors import RateLimited

_SLIDING_WINDOW = """
local key, now, window, limit = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
if redis.call('ZCARD', key) >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return tonumber(oldest[2]) + window - now
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, window)
return 0
"""


def identifier(*parts: str) -> str:
    """Stable key part that doesn't put emails or IPs into Redis in clear text."""
    return hashlib.sha256("|".join(p.strip().lower() for p in parts).encode()).hexdigest()[:32]


class RateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._script = redis.register_script(_SLIDING_WINDOW)

    async def hit(self, scope: str, key: str, limit: int, window: timedelta) -> None:
        """Record one attempt, or raise RateLimited if `limit` attempts already fall inside `window`."""
        now_ms = int(utcnow().timestamp() * 1000)
        window_ms = int(window.total_seconds() * 1000)
        wait_ms = int(
            await self._script(keys=[f"rl:{scope}:{key}"], args=[now_ms, window_ms, limit, uuid.uuid4().hex])
        )
        if wait_ms > 0:
            raise RateLimited(retry_after_seconds=math.ceil(wait_ms / 1000))
