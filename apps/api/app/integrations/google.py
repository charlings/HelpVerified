"""Google sign-in (OpenID Connect), behind a small interface (ADR 0016).

A small client over Google's endpoints rather than an OAuth library (the same choice as Paystack and
Firestore, ADR 0014): it builds the consent-screen URL (authorisation code + PKCE), swaps the code for
an ID token server-side with the client secret, and checks that token: signature against Google's
published keys (cached, refetched once for an unknown key id), audience, issuer, expiry and nonce.
Codes, tokens and the client secret are never logged.
"""

import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlencode

import httpx
import jwt

from app.core.config import Settings
from app.core.logging import get_logger

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105  # an endpoint, not a password
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")
JWKS_TTL_SECONDS = 3600
CLOCK_LEEWAY_SECONDS = 60

log = get_logger("app.google")


class GoogleAuthError(Exception):
    """Google refused the code, or its ID token didn't check out. The message is safe to log."""


@dataclass(frozen=True)
class GoogleIdentity:
    """Who Google says signed in. `sub` is Google's stable account id; emails can change."""

    sub: str
    email: str
    email_verified: bool
    name: str | None


class GoogleOAuth(Protocol):
    def authorization_url(self, *, state: str, code_challenge: str, nonce: str, redirect_uri: str) -> str: ...

    async def identify(
        self, *, code: str, code_verifier: str, redirect_uri: str, nonce: str
    ) -> GoogleIdentity: ...


class GoogleClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,  # tests pass httpx.MockTransport
    ) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._timeout = timeout
        self._transport = transport
        self._keys: jwt.PyJWKSet | None = None
        self._keys_fetched = 0.0

    def authorization_url(self, *, state: str, code_challenge: str, nonce: str, redirect_uri: str) -> str:
        query = {
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        return f"{AUTHORIZE_URL}?{urlencode(query)}"

    async def identify(
        self, *, code: str, code_verifier: str, redirect_uri: str, nonce: str
    ) -> GoogleIdentity:
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                response = await client.post(
                    TOKEN_URL,
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "code_verifier": code_verifier,
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                        "redirect_uri": redirect_uri,
                    },
                )
                if response.status_code != 200:
                    log.warning("google.code_refused", status=response.status_code)
                    raise GoogleAuthError("code refused")
                id_token = response.json().get("id_token")
                if not isinstance(id_token, str):
                    raise GoogleAuthError("no id_token")
                claims = await self._verify(client, id_token)
        except httpx.HTTPError as exc:
            raise GoogleAuthError(type(exc).__name__) from exc
        if claims.get("nonce") != nonce:
            raise GoogleAuthError("nonce mismatch")
        email = claims.get("email")
        if not isinstance(email, str) or not email:
            raise GoogleAuthError("no email")
        name = claims.get("name")
        return GoogleIdentity(
            sub=str(claims["sub"]),
            email=email,
            email_verified=claims.get("email_verified") is True,
            name=name if isinstance(name, str) and name.strip() else None,
        )

    async def _verify(self, client: httpx.AsyncClient, id_token: str) -> dict[str, Any]:
        try:
            kid = jwt.get_unverified_header(id_token).get("kid")
            key = await self._key(client, kid)
            claims: dict[str, Any] = jwt.decode(
                id_token,
                key,
                algorithms=["RS256"],
                audience=self._client_id,
                issuer=ISSUERS,
                leeway=CLOCK_LEEWAY_SECONDS,
                options={"require": ["exp", "iat", "aud", "iss", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise GoogleAuthError(type(exc).__name__) from exc
        return claims

    async def _key(self, client: httpx.AsyncClient, kid: object) -> Any:
        """The public key for `kid`. Google rotates keys, so an unknown id refetches the set once."""
        if not isinstance(kid, str):
            raise GoogleAuthError("no key id")
        for refetch in (False, True):
            keys = await self._key_set(client, force=refetch)
            for key in keys.keys:
                if key.key_id == kid:
                    return key.key
        raise GoogleAuthError("unknown key id")

    async def _key_set(self, client: httpx.AsyncClient, *, force: bool) -> jwt.PyJWKSet:
        if self._keys is not None and not force and time.time() < self._keys_fetched + JWKS_TTL_SECONDS:
            return self._keys
        response = await client.get(JWKS_URL)
        if response.status_code != 200:
            log.warning("google.keys_unavailable", status=response.status_code)
            raise GoogleAuthError("keys unavailable")
        self._keys = jwt.PyJWKSet.from_dict(response.json())
        self._keys_fetched = time.time()
        return self._keys


def google_from(settings: Settings) -> GoogleOAuth | None:
    """The Google client, or None when GOOGLE_CLIENT_ID/SECRET aren't set (Google sign-in is then off)."""
    if not settings.google_enabled:
        return None
    assert settings.GOOGLE_CLIENT_ID  # noqa: S101
    assert settings.GOOGLE_CLIENT_SECRET  # noqa: S101
    return GoogleClient(settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET.get_secret_value())
