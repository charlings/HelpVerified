"""Short-lived Google sign-in state in Redis (ADR 0016).

Two kinds of entry, each keyed by the hash of a random value that only the browser holds (in an
httpOnly cookie), so a Redis dump can't be replayed:

- A *flow*: started by `/auth/google/start`, spent once by the callback. Holds the PKCE verifier, the
  nonce Google must echo in its ID token, and where to send the user afterwards. Its key is the OAuth
  `state`, which the callback also checks against the browser's cookie (no login CSRF).
- A *pending sign-up*: a new Google user who still has to choose family or agency. Spent once by
  `/auth/google/complete`.
"""

import base64
import hashlib
import json
import secrets
from dataclasses import asdict, dataclass
from datetime import timedelta

from redis.asyncio import Redis

from app.core.security import hash_token, new_opaque_token
from app.integrations.google import GoogleIdentity

NEXT_MAX = 512


@dataclass(frozen=True)
class GoogleFlow:
    state: str
    code_verifier: str
    nonce: str
    next: str | None

    @property
    def code_challenge(self) -> str:
        digest = hashlib.sha256(self.code_verifier.encode()).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def clean_next(next_path: str | None) -> str | None:
    """Keeps only a same-site path. The web app checks it again before following it (redirects.ts)."""
    if not next_path or len(next_path) > NEXT_MAX:
        return None
    if not next_path.startswith("/") or next_path.startswith("//") or "\\" in next_path:
        return None
    return next_path


class GoogleFlows:
    def __init__(self, redis: Redis, flow_ttl: timedelta, pending_ttl: timedelta) -> None:
        self._redis = redis
        self._flow_ttl = flow_ttl
        self._pending_ttl = pending_ttl

    async def start(self, next_path: str | None) -> GoogleFlow:
        flow = GoogleFlow(
            state=new_opaque_token(),
            code_verifier=secrets.token_urlsafe(64),  # 86 characters; RFC 7636 allows 43-128
            nonce=new_opaque_token(),
            next=clean_next(next_path),
        )
        value = json.dumps({"code_verifier": flow.code_verifier, "nonce": flow.nonce, "next": flow.next})
        await self._redis.set(self._flow_key(flow.state), value, ex=self._flow_ttl)
        return flow

    async def finish(self, state: str) -> GoogleFlow | None:
        """The flow for `state`, removed so it can't be used twice; None if unknown or expired."""
        raw = await self._redis.getdel(self._flow_key(state))
        if raw is None:
            return None
        data = json.loads(raw)
        return GoogleFlow(
            state=state, code_verifier=data["code_verifier"], nonce=data["nonce"], next=data["next"]
        )

    async def hold_signup(self, identity: GoogleIdentity) -> str:
        """Stores a new Google user's identity; returns the token for the browser's cookie."""
        token = new_opaque_token()
        value = json.dumps(asdict(identity))
        await self._redis.set(self._pending_key(token), value, ex=self._pending_ttl)
        return token

    async def pending_signup(self, token: str | None) -> GoogleIdentity | None:
        if not token:
            return None
        return self._pending(await self._redis.get(self._pending_key(token)))

    async def take_signup(self, token: str | None) -> GoogleIdentity | None:
        """The pending sign-up, removed so it completes at most once."""
        if not token:
            return None
        return self._pending(await self._redis.getdel(self._pending_key(token)))

    @staticmethod
    def _pending(raw: bytes | str | None) -> GoogleIdentity | None:
        return None if raw is None else GoogleIdentity(**json.loads(raw))

    @staticmethod
    def _flow_key(state: str) -> str:
        return f"google:flow:{hash_token(state)}"

    @staticmethod
    def _pending_key(token: str) -> str:
        return f"google:pending:{hash_token(token)}"
