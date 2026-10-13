"""Live check of the Google OAuth client (ADR 0016), without a browser.

Uses GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and API_BASE_URL from apps/api/.env.

    cd apps/api
    uv run python -m scripts.google_live_check

It sends Google a made-up authorisation code. Google checks the client first: wrong credentials answer
`invalid_client`, right ones `invalid_grant` (the code is fake). Nothing is signed in and no account is
touched. It also fetches Google's signing keys. The secret is never printed.
The redirect URI can't be checked this way: it is printed so you can compare it with the console.
"""

import asyncio
import sys

import httpx

from app.core.config import load_settings
from app.integrations.google import JWKS_URL, TOKEN_URL


async def main() -> int:
    settings = load_settings()
    if not settings.google_enabled:
        print("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/api/.env first.")
        return 1
    assert settings.GOOGLE_CLIENT_ID  # noqa: S101
    assert settings.GOOGLE_CLIENT_SECRET  # noqa: S101
    if not settings.GOOGLE_CLIENT_ID.endswith(".apps.googleusercontent.com"):
        print("GOOGLE_CLIENT_ID doesn't look like an OAuth client ID (…apps.googleusercontent.com).")
        return 1
    print("Redirect URI this API sends (must be listed exactly in the console):")
    print("   ", settings.google_redirect_uri)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            keys = await client.get(JWKS_URL)
            token = await client.post(
                TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": "helpverified-live-check-not-a-real-code",
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET.get_secret_value(),
                    "redirect_uri": settings.google_redirect_uri,
                },
            )
    except httpx.HTTPError as exc:
        print("FAILED: couldn't reach Google:", type(exc).__name__)
        return 1
    if keys.status_code != 200 or not keys.json().get("keys"):
        print("FAILED: Google's signing keys weren't available (HTTP", keys.status_code, ")")
        return 1
    print("Google's signing keys: OK")
    error = (
        token.json().get("error")
        if token.headers.get("content-type", "").startswith("application/json")
        else None
    )
    if error == "invalid_grant":
        print(
            "Client ID and secret: OK (Google accepted the client and refused the made-up code, as expected)"
        )
        print("Next: open http://localhost:3000/login with mocks off and use Continue with Google.")
        return 0
    if error == "redirect_uri_mismatch":
        print("FAILED: add the redirect URI above to the OAuth client's authorised redirect URIs.")
        return 1
    if error in ("invalid_client", "unauthorized_client"):
        print(
            "FAILED: Google refused the client (",
            error,
            "). Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
        return 1
    print("FAILED: unexpected answer from Google: HTTP", token.status_code, error or "")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
