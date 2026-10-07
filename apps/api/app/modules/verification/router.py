"""The four checks, evidence uploads and document viewing."""

import uuid

from fastapi import APIRouter, Request, Response, status

from app.core.deps import CurrentAgency, CurrentUser, VerificationServiceDep, client_ip
from app.modules.verification.models import VerificationKind
from app.modules.verification.schemas import (
    DocumentOut,
    DocumentRegister,
    DocumentUrl,
    ItemOut,
    ItemUpdate,
    KindName,
    UploadSignatureIn,
    UploadSignatureOut,
)

router = APIRouter(tags=["verification"])


@router.get("/workers/{worker_id}/verification")
async def get_checks(
    worker_id: uuid.UUID, agency: CurrentAgency, checks: VerificationServiceDep
) -> list[ItemOut]:
    """The four checks with document metadata (never URLs)."""
    return await checks.items(agency, worker_id)


@router.patch("/workers/{worker_id}/verification/{kind}")
async def update_check(
    worker_id: uuid.UUID,
    kind: KindName,
    body: ItemUpdate,
    user: CurrentUser,
    agency: CurrentAgency,
    checks: VerificationServiceDep,
) -> ItemOut:
    """Save `details` (puts the check in review), or decide: `verified` (needs evidence) or `rejected` (needs
    a reason). Rejecting a verified check delists the worker."""
    return await checks.update_item(
        user, agency, worker_id, VerificationKind(kind), body.details, body.status, body.rejection_reason
    )


@router.post("/uploads/signature")
async def sign_upload(
    body: UploadSignatureIn, agency: CurrentAgency, checks: VerificationServiceDep
) -> UploadSignatureOut:
    """Cloudinary upload parameters signed for one folder. Documents upload as `authenticated` assets."""
    signed = await checks.sign_upload(
        agency, body.worker_id, body.purpose, VerificationKind(body.kind) if body.kind else None
    )
    return UploadSignatureOut(
        upload_url=signed.upload_url,
        api_key=signed.api_key,
        timestamp=signed.timestamp,
        signature=signed.signature,
        folder=signed.folder,
        type=signed.type,
    )


@router.post("/workers/{worker_id}/verification/{kind}/documents", status_code=status.HTTP_201_CREATED)
async def register_document(
    worker_id: uuid.UUID,
    kind: KindName,
    body: DocumentRegister,
    user: CurrentUser,
    agency: CurrentAgency,
    checks: VerificationServiceDep,
) -> DocumentOut:
    """Attach an uploaded file after Cloudinary confirms it (folder, type, format, size)."""
    return await checks.register_document(user, agency, worker_id, VerificationKind(kind), body.public_id)


@router.delete(
    "/workers/{worker_id}/verification/{kind}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_document(
    worker_id: uuid.UUID,
    kind: KindName,
    document_id: uuid.UUID,
    agency: CurrentAgency,
    checks: VerificationServiceDep,
) -> Response:
    await checks.remove_document(agency, worker_id, VerificationKind(kind), document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/documents/{document_id}/url")
async def document_url(
    document_id: uuid.UUID, request: Request, user: CurrentUser, checks: VerificationServiceDep
) -> DocumentUrl:
    """A download link valid for a few minutes, for the owning agency or a super admin. Every call is
    logged. Anyone else, families included, gets 404."""
    link = await checks.document_url(user, document_id, client_ip(request))
    return DocumentUrl(url=link.url, expires_at=link.expires_at)
