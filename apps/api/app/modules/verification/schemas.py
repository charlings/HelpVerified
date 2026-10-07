"""Check, document and upload payloads (api-contracts.md §4 VerificationItemOut; mock: verification.ts,
uploads.ts, documents.ts). Documents are described by metadata only: never a URL or public_id."""

import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, StringConstraints
from pydantic_core import PydanticCustomError

from app.modules.verification.models import VerificationDocument, VerificationItem

KindName = Literal["id", "guarantor", "references", "address"]
_DETAIL_KEY = re.compile(r"^[a-z][a-z0-9_]{0,39}$")


def _details(value: dict[str, str]) -> dict[str, str]:
    if len(value) > 12:
        raise PydanticCustomError("details", "Too many fields.")
    if any(not _DETAIL_KEY.match(key) for key in value):
        raise PydanticCustomError("details", "Field names must be lowercase words.")
    return {key: text.strip() for key, text in value.items()}


Details = Annotated[dict[str, Annotated[str, StringConstraints(max_length=500)]], AfterValidator(_details)]


class ItemUpdate(BaseModel):
    """PATCH /workers/{id}/verification/{kind}: either new `details`, or a review decision.
    The service enforces "one or the other" and the rejection reason, so errors name the right field."""

    details: Details | None = None
    status: Literal["verified", "rejected"] | None = None
    rejection_reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class DocumentOut(BaseModel):
    id: uuid.UUID
    format: Literal["jpg", "png", "pdf"]
    bytes: int
    created_at: datetime

    @classmethod
    def of(cls, document: VerificationDocument) -> DocumentOut:
        return cls(
            id=document.id, format=document.format, bytes=document.bytes, created_at=document.created_at
        )


class ItemOut(BaseModel):
    kind: KindName
    status: Literal["not_started", "submitted", "verified", "rejected", "expired"]
    details: dict[str, str]
    verified_at: datetime | None
    expires_at: datetime | None
    rejection_reason: str | None
    flag_reason: str | None
    flagged_at: datetime | None
    documents: list[DocumentOut]

    @classmethod
    def of(cls, item: VerificationItem, documents: list[VerificationDocument]) -> ItemOut:
        return cls(
            kind=item.kind.value,
            status=item.status.value,
            details={str(k): str(v) for k, v in item.details.items()},
            verified_at=item.verified_at,
            expires_at=item.expires_at,
            rejection_reason=item.rejection_reason,
            flag_reason=item.flag_reason,
            flagged_at=item.flagged_at,
            documents=[DocumentOut.of(d) for d in documents],
        )


class DocumentRegister(BaseModel):
    public_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class DocumentUrl(BaseModel):
    url: str
    expires_at: datetime


class UploadSignatureIn(BaseModel):
    purpose: Literal["worker_photo", "verification_doc"]
    worker_id: uuid.UUID
    kind: KindName | None = Field(default=None, description="Required for verification_doc")


class UploadSignatureOut(BaseModel):
    upload_url: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    type: Literal["upload", "authenticated"]
