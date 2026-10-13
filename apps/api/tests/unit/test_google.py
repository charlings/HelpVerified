"""The Google client's ID-token checks, settings and `next` cleaning (ADR 0016). No network: Google's
token endpoint and key set are an httpx.MockTransport, signing with a key made here."""

import asyncio
import json
import time
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm
from pydantic import ValidationError

from app.core.config import Settings
from app.integrations.google import JWKS_URL, TOKEN_URL, GoogleAuthError, GoogleClient, GoogleIdentity
from app.modules.auth.google import clean_next

CLIENT_ID = "test-client.apps.googleusercontent.com"
REDIRECT = "http://testserver/api/v1/auth/google/callback"
NONCE = "the-nonce"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwk(key: rsa.RSAPrivateKey, kid: str) -> dict[str, Any]:
    public: dict[str, Any] = json.loads(RSAAlgorithm.to_jwk(key.public_key()))
    return public | {"kid": kid, "alg": "RS256", "use": "sig"}


def id_token(key: rsa.RSAPrivateKey = KEY, kid: str = "k1", **overrides: Any) -> str:
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "1234567890",
        "email": "ada@gmail.com",
        "email_verified": True,
        "name": "Ada Okafor",
        "nonce": NONCE,
        "iat": now,
        "exp": now + 3600,
    } | overrides
    return jwt.encode(
        {k: v for k, v in claims.items() if v is not None}, key, algorithm="RS256", headers={"kid": kid}
    )


class FakeGoogleEndpoints:
    def __init__(self, token: str, keys: list[dict[str, Any]], token_status: int = 200) -> None:
        self.token = token
        self.keys = keys
        self.token_status = token_status
        self.key_fetches = 0
        self.token_form: dict[str, str] = {}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if str(request.url) == TOKEN_URL:
            self.token_form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            return httpx.Response(self.token_status, json={"id_token": self.token})
        if str(request.url) == JWKS_URL:
            self.key_fetches += 1
            return httpx.Response(200, json={"keys": self.keys})
        return httpx.Response(404)


def identify(endpoints: FakeGoogleEndpoints, client: GoogleClient | None = None) -> GoogleIdentity:
    client = client or GoogleClient(CLIENT_ID, "secret", transport=httpx.MockTransport(endpoints))
    return asyncio.run(
        client.identify(code="the-code", code_verifier="v" * 64, redirect_uri=REDIRECT, nonce=NONCE)
    )


def test_a_valid_id_token_gives_the_identity_and_the_exchange_sends_pkce() -> None:
    endpoints = FakeGoogleEndpoints(id_token(), [jwk(KEY, "k1")])

    identity = identify(endpoints)

    assert identity == GoogleIdentity("1234567890", "ada@gmail.com", True, "Ada Okafor")
    assert endpoints.token_form == {
        "grant_type": "authorization_code",
        "code": "the-code",
        "code_verifier": "v" * 64,
        "client_id": CLIENT_ID,
        "client_secret": "secret",
        "redirect_uri": REDIRECT,
    }


@pytest.mark.parametrize(
    ("token", "reason"),
    [
        (id_token(aud="someone-else.apps.googleusercontent.com"), "InvalidAudienceError"),
        (id_token(iss="https://evil.example"), "InvalidIssuerError"),
        (id_token(exp=int(time.time()) - 3600), "ExpiredSignatureError"),
        (id_token(OTHER_KEY), "InvalidSignatureError"),
        (id_token(nonce="replayed-nonce"), "nonce mismatch"),
        (id_token(email=None), "no email"),
        (id_token(kid="unknown"), "unknown key id"),
    ],
)
def test_id_tokens_that_do_not_check_out_are_refused(token: str, reason: str) -> None:
    with pytest.raises(GoogleAuthError, match=reason):
        identify(FakeGoogleEndpoints(token, [jwk(KEY, "k1")]))


def test_email_verified_must_be_true_not_just_truthy() -> None:
    identity = identify(FakeGoogleEndpoints(id_token(email_verified="true"), [jwk(KEY, "k1")]))

    assert identity.email_verified is False


def test_a_refused_code_is_an_error() -> None:
    with pytest.raises(GoogleAuthError, match="code refused"):
        identify(FakeGoogleEndpoints(id_token(), [jwk(KEY, "k1")], token_status=400))


def test_keys_are_cached_and_refetched_once_when_google_rotates_them() -> None:
    endpoints = FakeGoogleEndpoints(id_token(), [jwk(KEY, "k1")])
    client = GoogleClient(CLIENT_ID, "secret", transport=httpx.MockTransport(endpoints))
    identify(endpoints, client)
    identify(endpoints, client)
    assert endpoints.key_fetches == 1

    endpoints.keys = [jwk(OTHER_KEY, "k2")]
    endpoints.token = id_token(OTHER_KEY, kid="k2")
    identify(endpoints, client)

    assert endpoints.key_fetches == 2


def test_the_authorization_url_asks_for_openid_email_profile_with_s256() -> None:
    client = GoogleClient(CLIENT_ID, "secret")

    url = client.authorization_url(state="s", code_challenge="c", nonce="n", redirect_uri=REDIRECT)

    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    params = {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
    assert params == {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT,
        "response_type": "code",
        "scope": "openid email profile",
        "state": "s",
        "nonce": "n",
        "code_challenge": "c",
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    assert "secret" not in url


# Settings


def test_google_settings_are_both_or_neither() -> None:
    with pytest.raises(ValidationError, match="GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"):
        Settings(_env_file=None, GOOGLE_CLIENT_SECRET=None)  # not the owner's .env

    assert not Settings(_env_file=None, GOOGLE_CLIENT_ID=None, GOOGLE_CLIENT_SECRET=None).google_enabled


def test_the_redirect_uri_comes_from_api_base_url(settings: Settings) -> None:
    deployed = settings.model_copy(update={"API_BASE_URL": "https://api.helpverified.ng/"})

    assert deployed.google_redirect_uri == "https://api.helpverified.ng/api/v1/auth/google/callback"
    assert settings.google_redirect_uri == "http://testserver/api/v1/auth/google/callback"


@pytest.mark.parametrize(
    ("value", "kept"),
    [
        ("/family/requests?tab=open", "/family/requests?tab=open"),
        ("/signup/agency", "/signup/agency"),
        ("//evil.example", None),
        ("https://evil.example", None),
        ("/\\evil.example", None),
        ("family", None),
        ("/" + "a" * 600, None),
        (None, None),
    ],
)
def test_clean_next_keeps_only_same_site_paths(value: str | None, kept: str | None) -> None:
    assert clean_next(value) == kept
