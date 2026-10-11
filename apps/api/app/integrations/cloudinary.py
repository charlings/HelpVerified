"""Cloudinary behind a small interface (backend.md §7, security-and-compliance.md §3).

- Uploads go browser → Cloudinary with parameters this API signs, restricted to one folder.
- After an upload, the API looks the asset up with the Admin API before trusting it.
- Verification documents are `authenticated` assets, viewed only through expiring download
  URLs generated per request. Those URLs are never stored, cached or logged.

Signing follows Cloudinary's scheme: the parameters sorted by name, joined as `k=v` with `&`,
the API secret appended, and the SHA-1 hex digest taken.
"""

import hashlib
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from urllib.parse import urlencode

import httpx

API_BASE = "https://api.cloudinary.com/v1_1"


@dataclass(frozen=True)
class SignedUpload:
    upload_url: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    type: str  # "upload" (worker photos) or "authenticated" (documents)


@dataclass(frozen=True)
class Asset:
    public_id: str
    type: str
    resource_type: str
    format: str
    bytes: int


class Cloudinary(Protocol):
    def sign_upload(self, folder: str, delivery_type: str, timestamp: int) -> SignedUpload: ...

    async def find_asset(self, public_id: str, delivery_type: str) -> Asset | None: ...

    def private_download_url(self, asset: Asset, expires_at: datetime, timestamp: int) -> str: ...

    async def destroy(self, asset: Asset, timestamp: int) -> None: ...


def sign(params: dict[str, str | int], api_secret: str) -> str:
    to_sign = "&".join(f"{key}={params[key]}" for key in sorted(params) if params[key] != "")
    return hashlib.sha1((to_sign + api_secret).encode(), usedforsecurity=False).hexdigest()


class CloudinaryClient:
    def __init__(self, cloud_name: str, api_key: str, api_secret: str, timeout: float = 10.0) -> None:
        self.cloud_name = cloud_name
        self.api_key = api_key
        self._api_secret = api_secret
        self._timeout = timeout

    def sign_upload(self, folder: str, delivery_type: str, timestamp: int) -> SignedUpload:
        params: dict[str, str | int] = {"folder": folder, "timestamp": timestamp, "type": delivery_type}
        return SignedUpload(
            upload_url=f"{API_BASE}/{self.cloud_name}/auto/upload",
            api_key=self.api_key,
            timestamp=timestamp,
            signature=sign(params, self._api_secret),
            folder=folder,
            type=delivery_type,
        )

    async def find_asset(self, public_id: str, delivery_type: str) -> Asset | None:
        """Admin API lookup. PDFs uploaded with `auto` are stored as images, so images are tried first."""
        async with httpx.AsyncClient(auth=(self.api_key, self._api_secret), timeout=self._timeout) as client:
            for resource_type in ("image", "raw"):
                url = f"{API_BASE}/{self.cloud_name}/resources/{resource_type}/{delivery_type}/{public_id}"
                response = await client.get(url)
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                body = response.json()
                return Asset(
                    public_id=body["public_id"],
                    type=body.get("type", delivery_type),
                    resource_type=body.get("resource_type", resource_type),
                    format=str(body.get("format") or public_id.rsplit(".", 1)[-1]).lower(),
                    bytes=int(body["bytes"]),
                )
        return None

    def private_download_url(self, asset: Asset, expires_at: datetime, timestamp: int) -> str:
        params: dict[str, str | int] = {
            "public_id": asset.public_id,
            "format": asset.format,
            "type": asset.type,
            "timestamp": timestamp,
            "expires_at": int(expires_at.timestamp()),
        }
        query = {**params, "signature": sign(params, self._api_secret), "api_key": self.api_key}
        return f"{API_BASE}/{self.cloud_name}/{asset.resource_type}/download?{urlencode(query)}"

    async def destroy(self, asset: Asset, timestamp: int) -> None:
        """Deletes the file and its cached copies (B6 retention). "not found" counts as done, so a retry
        after a lost response is harmless. Raises httpx.HTTPError on failure; the job tries again."""
        params: dict[str, str | int] = {
            "public_id": asset.public_id,
            "type": asset.type,
            "invalidate": "true",
            "timestamp": timestamp,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{API_BASE}/{self.cloud_name}/{asset.resource_type}/destroy",
                data={**params, "signature": sign(params, self._api_secret), "api_key": self.api_key},
            )
        response.raise_for_status()
        result = response.json().get("result")
        if result not in ("ok", "not found"):
            raise httpx.HTTPStatusError(f"destroy: {result}", request=response.request, response=response)
