"""The four checks, their evidence, and rule 1: listing (CLAUDE.md, database.md §4).

`list_worker` refuses with a friendly error first; the `workers_listing_gate` trigger is the backstop
for every other path. Any check leaving `verified` delists the worker through the
`verification_items_delist` trigger, so every path here that does that is covered by the database too.
Rules mirror apps/web/src/mocks/handlers/verification.ts, which the frontend was signed off against.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.dates import add_months
from app.core.errors import (
    AgencyNotActive,
    BadRequest,
    EvidenceRequired,
    IllegalTransition,
    NotFound,
    ValidationFailed,
    WorkerNotVerified,
)
from app.core.logging import get_logger
from app.integrations.cloudinary import Asset, Cloudinary, SignedUpload
from app.modules.admin.models import AuditAction
from app.modules.admin.repository import AuditRepository
from app.modules.agencies.models import Agency
from app.modules.agencies.repository import AgencyRepository
from app.modules.agencies.service import is_active
from app.modules.users.models import User, UserRole
from app.modules.verification.models import (
    KINDS,
    VerificationDocument,
    VerificationItem,
    VerificationKind,
    VerificationStatus,
)
from app.modules.verification.repository import VerificationRepository
from app.modules.verification.schemas import DocumentOut, ItemOut
from app.modules.workers.models import ListingStatus, Worker
from app.modules.workers.repository import WorkerRepository

log = get_logger("app.verification")

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
DOCUMENT_FORMATS = frozenset({"jpg", "png", "pdf"})
EXPIRING_KINDS = frozenset(
    {VerificationKind.references, VerificationKind.address}
)  # ID and guarantor don't expire
REOPENS = frozenset({VerificationStatus.not_started, VerificationStatus.rejected, VerificationStatus.expired})


def document_folder(worker_id: uuid.UUID, kind: VerificationKind) -> str:
    return f"workers/docs/{worker_id}/{kind.value}"


def photo_folder(worker_id: uuid.UUID) -> str:
    return f"workers/photos/{worker_id}"


def _unverify(item: VerificationItem, to: VerificationStatus) -> None:
    """Leaves `verified`; the delist trigger takes the worker off the list."""
    item.status = to
    item.verified_at = None
    item.verified_by = None
    item.expires_at = None


@dataclass(frozen=True)
class DocumentLink:
    url: str
    expires_at: Any


class VerificationService:
    def __init__(self, session: AsyncSession, settings: Settings, cloudinary: Cloudinary) -> None:
        self.session = session
        self.settings = settings
        self.cloudinary = cloudinary
        self.checks = VerificationRepository(session)
        self.workers = WorkerRepository(session)
        self.agencies = AgencyRepository(session)
        self.audit = AuditRepository(session)

    # Reading

    async def items_out(self, worker_id: uuid.UUID) -> list[ItemOut]:
        items = await self.checks.items(worker_id)
        documents = await self.checks.documents([i.id for i in items])
        return [ItemOut.of(item, documents[item.id]) for item in items]

    async def items(self, agency: Agency, worker_id: uuid.UUID) -> list[ItemOut]:
        async with self.session.begin():
            await self._owned(agency, worker_id)
            return await self.items_out(worker_id)

    # Changing a check

    async def update_item(
        self,
        user: User,
        agency: Agency,
        worker_id: uuid.UUID,
        kind: VerificationKind,
        details: dict[str, str] | None,
        status: str | None,
        rejection_reason: str | None,
    ) -> ItemOut:
        if (details is None) == (status is None):
            raise BadRequest("Send either details, or status verified or rejected.")
        if status == "rejected" and not rejection_reason:
            raise ValidationFailed(
                details={"fields": {"rejection_reason": ["Explain why this check was rejected."]}}
            )
        now = utcnow()
        async with self.session.begin():
            await self._owned(agency, worker_id)
            item = await self.checks.item(worker_id, kind, for_update=True)
            if details is not None:
                if item.status is VerificationStatus.verified:
                    raise IllegalTransition("Reject the check before changing verified details.")
                item.details = {**item.details, **details}
                self._reopen(item)
            elif status == "verified":
                if item.status is not VerificationStatus.submitted:
                    raise IllegalTransition("Only checks in review can be verified.")
                if not await self.checks.has_evidence(item.id):
                    raise EvidenceRequired()
                item.status = VerificationStatus.verified
                item.verified_by = user.id
                item.verified_at = now
                item.expires_at = (
                    add_months(now, self.settings.VERIFICATION_TTL_MONTHS)
                    if item.kind in EXPIRING_KINDS
                    else None
                )
                item.rejection_reason = None
                item.flag_reason = None  # re-verifying answers an admin flag
                item.flagged_at = None
            else:
                if item.status not in (VerificationStatus.submitted, VerificationStatus.verified):
                    raise IllegalTransition("Only checks in review or verified can be rejected.")
                _unverify(item, VerificationStatus.rejected)
                item.rejection_reason = rejection_reason
            await self.session.flush()
            documents = await self.checks.documents([item.id])
            return ItemOut.of(item, documents[item.id])

    @staticmethod
    def _reopen(item: VerificationItem) -> None:
        """New details or evidence put a not-started, rejected or expired check back in review."""
        if item.status in REOPENS:
            item.status = VerificationStatus.submitted
            item.rejection_reason = None

    # Evidence

    async def sign_upload(
        self, agency: Agency, worker_id: uuid.UUID, purpose: str, kind: VerificationKind | None
    ) -> SignedUpload:
        """Upload parameters signed for one folder: documents are `authenticated`, photos are public."""
        if purpose == "verification_doc" and kind is None:
            raise ValidationFailed(details={"fields": {"kind": ["Choose which check this document is for."]}})
        async with self.session.begin():
            await self._owned(agency, worker_id)
        timestamp = int(utcnow().timestamp())
        if purpose == "verification_doc" and kind is not None:
            return self.cloudinary.sign_upload(document_folder(worker_id, kind), "authenticated", timestamp)
        return self.cloudinary.sign_upload(photo_folder(worker_id), "upload", timestamp)

    async def register_document(
        self, user: User, agency: Agency, worker_id: uuid.UUID, kind: VerificationKind, public_id: str
    ) -> DocumentOut:
        """Trusts an upload only once Cloudinary confirms it: right folder, authenticated, jpg/png/pdf,
        at most 10 MB."""
        async with self.session.begin():
            await self._owned(agency, worker_id)
        if not public_id.startswith(document_folder(worker_id, kind) + "/"):
            raise _bad_upload("Upload the file again.")
        asset = await self.cloudinary.find_asset(public_id, "authenticated")
        if asset is None:
            raise _bad_upload("Upload the file again.")
        if asset.bytes > MAX_DOCUMENT_BYTES or asset.format not in DOCUMENT_FORMATS:
            raise _bad_upload("Use a JPG, PNG or PDF up to 10 MB.")
        async with self.session.begin():
            await self._owned(agency, worker_id)
            item = await self.checks.item(worker_id, kind, for_update=True)
            document = await self.checks.add_document(
                VerificationDocument(
                    item_id=item.id,
                    cloudinary_public_id=asset.public_id,
                    resource_type=asset.resource_type,
                    format=asset.format,
                    bytes=asset.bytes,
                    uploaded_by=user.id,
                )
            )
            self._reopen(item)
            return DocumentOut.of(document)

    async def remove_document(
        self, agency: Agency, worker_id: uuid.UUID, kind: VerificationKind, document_id: uuid.UUID
    ) -> None:
        """Soft delete. Removing evidence from a verified check sends it back to review (and delists)."""
        async with self.session.begin():
            await self._owned(agency, worker_id)
            item = await self.checks.item(worker_id, kind, for_update=True)
            document = await self.checks.document(document_id, item_id=item.id)
            if document is None:
                raise NotFound()
            document.deleted_at = utcnow()
            if item.status is VerificationStatus.verified:
                _unverify(item, VerificationStatus.submitted)

    async def document_url(self, user: User, document_id: uuid.UUID, ip: str | None) -> DocumentLink:
        """Permission check → access log + audit entry → a download URL that expires in minutes.
        Families, other agencies and missing documents all get 404 (security §3)."""
        now = utcnow()
        async with self.session.begin():
            found = await self.checks.document_owner(document_id)
            if found is None:
                raise NotFound()
            document, item, worker = found
            if user.role is UserRole.agency_admin:
                agency = await self.agencies.for_user(user.id)
                if agency is None or agency.id != worker.agency_id:
                    raise NotFound()
            elif user.role is not UserRole.super_admin:
                raise NotFound()
            await self.checks.log_access(document.id, user.id, "verification_review", ip)
            await self.audit.write(
                user.id,
                AuditAction.document_viewed,
                "document",
                document.id,
                {
                    "label": f"{worker.full_name}, {item.kind.value} evidence",
                    "kind": item.kind.value,
                    "worker_id": str(worker.id),
                },
                ip,
            )
        expires_at = now + timedelta(seconds=self.settings.CLOUDINARY_SIGNED_URL_TTL_SEC)
        asset = Asset(
            document.cloudinary_public_id,
            "authenticated",
            document.resource_type,
            document.format,
            document.bytes,
        )
        # Built after the commit and returned once: never stored, cached or logged.
        url = self.cloudinary.private_download_url(asset, expires_at, int(now.timestamp()))
        log.info("document.viewed", document_id=str(document.id), user_id=str(user.id))
        return DocumentLink(url=url, expires_at=expires_at)

    # Rule 1: listing

    async def list_worker(self, agency: Agency, worker_id: uuid.UUID) -> Worker:
        """Lists the worker if all four checks are verified and unexpired and the agency is active.
        Order matches the mock: not found → agency not active → suspended → already listed → gate."""
        now = utcnow()
        async with self.session.begin():
            worker = await self._owned(agency, worker_id, for_update=True)
            current = await self.agencies.get(agency.id)
            if current is None or not is_active(current, await self.agencies.subscription(agency.id)):
                raise AgencyNotActive()
            if worker.listing_status is ListingStatus.suspended:
                raise IllegalTransition("This worker is suspended with the agency.")
            if worker.listing_status is ListingStatus.listed:
                return worker
            if await self.checks.count_verified_unexpired(worker.id, now) < len(KINDS):
                raise WorkerNotVerified()
            worker.listing_status = ListingStatus.listed
            await self.workers.save_listing(worker)  # the trigger re-checks and stamps listed_at
            log.info("worker.listed", worker_id=str(worker.id), agency_id=str(agency.id))
            return worker

    async def delist_worker(self, agency: Agency, worker_id: uuid.UUID) -> Worker:
        async with self.session.begin():
            worker = await self._owned(agency, worker_id, for_update=True)
            if worker.listing_status is not ListingStatus.listed:
                raise IllegalTransition("This worker isn't listed.")
            worker.listing_status = ListingStatus.delisted
            await self.workers.save_listing(worker)
            return worker

    async def expire_lapsed(self) -> int:
        """Marks verified checks past their expiry `expired` (the trigger delists). Scheduled daily in B6."""
        async with self.session.begin():
            count = await self.checks.expire_lapsed(utcnow())
        if count:
            log.info("verification.expired", count=count)
        return count

    # Admin

    async def flag(self, admin: User, worker_id: uuid.UUID, kind: VerificationKind, reason: str) -> Worker:
        """A super admin sends a verified check back to review with a reason the agency sees.
        The worker is delisted (trigger); an active placement continues (database.md §4)."""
        async with self.session.begin():
            worker = await self.workers.get(worker_id)
            if worker is None:
                raise NotFound()
            item = await self.checks.item(worker_id, kind, for_update=True)
            if item.status is not VerificationStatus.verified:
                raise IllegalTransition("Only verified checks can be flagged.")
            _unverify(item, VerificationStatus.submitted)
            item.flag_reason = reason
            item.flagged_at = utcnow()
            await self.session.flush()
            await self.session.refresh(worker)  # the delist trigger changed the row
            await self.audit.write(
                admin.id,
                AuditAction.worker_check_flagged,
                "worker",
                worker.id,
                {"label": worker.full_name, "kind": kind.value, "reason": reason},
            )
            return worker

    async def _owned(self, agency: Agency, worker_id: uuid.UUID, *, for_update: bool = False) -> Worker:
        worker = await self.workers.get_owned(worker_id, agency.id, for_update=for_update)
        if worker is None:
            raise NotFound()
        return worker


def _bad_upload(message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {"public_id": [message]}})
