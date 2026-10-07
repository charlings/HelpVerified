"""One-off live check of the Cloudinary integration against a real account (B3).

Uses the CLOUDINARY_* keys from apps/api/.env. It uploads one tiny generated PNG as an
`authenticated` asset with parameters signed exactly as the API signs them, looks it up with
the Admin API as registration does, downloads it through an expiring private URL, checks the
URL stops working without its signature, then deletes the asset. Nothing else is touched.

    cd apps/api
    uv run python -m scripts.cloudinary_live_check
"""

import asyncio
import base64
import sys
import uuid
from datetime import UTC, datetime, timedelta

import httpx

from app.core.config import load_settings
from app.integrations.cloudinary import API_BASE, CloudinaryClient, sign

# A 1 by 1 pixel transparent PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


async def main() -> int:
    settings = load_settings()
    secret = settings.CLOUDINARY_API_SECRET.get_secret_value()
    client = CloudinaryClient(settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, secret)
    folder = f"workers/docs/live-check-{uuid.uuid4().hex[:8]}/id"
    now = datetime.now(UTC)
    signed = client.sign_upload(folder, "authenticated", int(now.timestamp()))

    async with httpx.AsyncClient(timeout=30) as http:
        upload = await http.post(
            signed.upload_url,
            data={
                "api_key": signed.api_key,
                "timestamp": str(signed.timestamp),
                "signature": signed.signature,
                "folder": signed.folder,
                "type": signed.type,
            },
            files={"file": ("check.png", PNG, "image/png")},
        )
        print("1. signed upload:", upload.status_code)
        if upload.status_code != 200:
            print("   ", upload.text[:300])
            return 1
        public_id = upload.json()["public_id"]

        asset = await client.find_asset(public_id, "authenticated")
        print(
            "2. Admin API lookup:", "found" if asset else "NOT FOUND", asset and (asset.format, asset.bytes)
        )
        if asset is None:
            return 1

        url = client.private_download_url(asset, now + timedelta(minutes=5), int(now.timestamp()))
        download = await http.get(url, follow_redirects=True)
        print("3. expiring download URL:", download.status_code, f"{len(download.content)} bytes")

        tampered = await http.get(url.replace("signature=", "signature=0"), follow_redirects=True)
        print("4. tampered URL refused:", tampered.status_code != 200, f"({tampered.status_code})")

        public = await http.get(
            f"https://res.cloudinary.com/{settings.CLOUDINARY_CLOUD_NAME}/image/upload/{public_id}.png"
        )
        print("5. not reachable as a public asset:", public.status_code != 200, f"({public.status_code})")

        timestamp = int(datetime.now(UTC).timestamp())
        destroy_params: dict[str, str | int] = {
            "public_id": public_id,
            "timestamp": timestamp,
            "type": "authenticated",
        }
        destroyed = await http.post(
            f"{API_BASE}/{settings.CLOUDINARY_CLOUD_NAME}/image/destroy",
            data={
                **destroy_params,
                "api_key": settings.CLOUDINARY_API_KEY,
                "signature": sign(destroy_params, secret),
            },
        )
        print("6. cleaned up:", destroyed.json().get("result"))

    ok = download.status_code == 200 and tampered.status_code != 200 and public.status_code != 200
    print("LIVE CHECK", "PASSED" if ok else "FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
