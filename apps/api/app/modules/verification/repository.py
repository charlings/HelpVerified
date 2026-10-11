"""Checks, documents and the document access log."""

import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationFailed
from app.modules.placements.models import ACTIVE, Placement
from app.modules.verification.models import (
    KINDS,
    DocumentAccess,
    VerificationDocument,
    VerificationItem,
    VerificationKind,
    VerificationStatus,
)
from app.modules.workers.models import ListingStatus, Worker


class VerificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def items(self, worker_id: uuid.UUID) -> list[VerificationItem]:
        """The four checks in the fixed order id, guarantor, references, address."""
        rows = await self.session.scalars(
            select(VerificationItem).where(VerificationItem.worker_id == worker_id)
        )
        by_kind = {item.kind: item for item in rows}
        return [by_kind[kind] for kind in KINDS]

    async def item(
        self, worker_id: uuid.UUID, kind: VerificationKind, *, for_update: bool = False
    ) -> VerificationItem:
        query = select(VerificationItem).where(
            VerificationItem.worker_id == worker_id, VerificationItem.kind == kind
        )
        item = await self.session.scalar(query.with_for_update() if for_update else query)
        assert item is not None  # noqa: S101  # every worker has all four (created together)
        return item

    async def statuses(self, worker_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, str]]:
        rows = await self.session.execute(
            select(VerificationItem.worker_id, VerificationItem.kind, VerificationItem.status).where(
                VerificationItem.worker_id.in_(worker_ids)
            )
        )
        result: dict[uuid.UUID, dict[str, str]] = defaultdict(dict)
        for worker_id, kind, status in rows:
            result[worker_id][kind.value] = status.value
        return result

    async def count_for_agency(self, agency_id: uuid.UUID, statuses: tuple[VerificationStatus, ...]) -> int:
        return (
            await self.session.scalar(
                select(func.count())
                .select_from(VerificationItem)
                .join(Worker, Worker.id == VerificationItem.worker_id)
                .where(Worker.agency_id == agency_id, VerificationItem.status.in_(statuses))
            )
            or 0
        )

    async def count_verified_unexpired(self, worker_id: uuid.UUID, now: datetime) -> int:
        """What the listing gate counts (database.md §4), so the service refuses before the trigger does."""
        return (
            await self.session.scalar(
                select(func.count()).where(
                    VerificationItem.worker_id == worker_id,
                    VerificationItem.status == VerificationStatus.verified,
                    (VerificationItem.expires_at.is_(None)) | (VerificationItem.expires_at > now),
                )
            )
            or 0
        )

    async def documents(self, item_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[VerificationDocument]]:
        rows = await self.session.scalars(
            select(VerificationDocument)
            .where(VerificationDocument.item_id.in_(item_ids), VerificationDocument.deleted_at.is_(None))
            .order_by(VerificationDocument.created_at)
        )
        result: dict[uuid.UUID, list[VerificationDocument]] = defaultdict(list)
        for doc in rows:
            result[doc.item_id].append(doc)
        return result

    async def has_evidence(self, item_id: uuid.UUID) -> bool:
        return (
            await self.session.scalar(
                select(func.count()).where(
                    VerificationDocument.item_id == item_id, VerificationDocument.deleted_at.is_(None)
                )
            )
            or 0
        ) > 0

    async def add_document(self, document: VerificationDocument) -> VerificationDocument:
        self.session.add(document)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            if "uq_verification_documents_cloudinary_public_id" in str(exc.orig):
                raise ValidationFailed(
                    details={"fields": {"public_id": ["This file is already attached."]}}
                ) from exc
            raise
        await self.session.refresh(document)
        return document

    async def document(
        self, document_id: uuid.UUID, item_id: uuid.UUID | None = None
    ) -> VerificationDocument | None:
        query = select(VerificationDocument).where(
            VerificationDocument.id == document_id, VerificationDocument.deleted_at.is_(None)
        )
        if item_id:
            query = query.where(VerificationDocument.item_id == item_id)
        return await self.session.scalar(query)

    async def document_owner(
        self, document_id: uuid.UUID
    ) -> tuple[VerificationDocument, VerificationItem, Worker] | None:
        row = (
            await self.session.execute(
                select(VerificationDocument, VerificationItem, Worker)
                .join(VerificationItem, VerificationItem.id == VerificationDocument.item_id)
                .join(Worker, Worker.id == VerificationItem.worker_id)
                .where(VerificationDocument.id == document_id, VerificationDocument.deleted_at.is_(None))
            )
        ).first()
        return (row[0], row[1], row[2]) if row else None

    async def log_access(
        self, document_id: uuid.UUID, user_id: uuid.UUID, purpose: str, ip: str | None
    ) -> None:
        self.session.add(DocumentAccess(document_id=document_id, user_id=user_id, purpose=purpose, ip=ip))
        await self.session.flush()

    async def expire_lapsed(self, now: datetime) -> list[tuple[uuid.UUID, VerificationKind]]:
        """Verified checks past expires_at become `expired`; the trigger then delists their workers.
        Returns (worker_id, kind) for each check that expired."""
        result = await self.session.execute(
            update(VerificationItem)
            .where(
                VerificationItem.status == VerificationStatus.verified,
                VerificationItem.expires_at.is_not(None),
                VerificationItem.expires_at <= now,
            )
            .values(status=VerificationStatus.expired)
            .returning(VerificationItem.worker_id, VerificationItem.kind)
        )
        return [(worker_id, kind) for worker_id, kind in result]

    # Retention (security-and-compliance.md §1)

    async def delete_rejected_evidence(self, rejected_before: datetime, now: datetime) -> int:
        """Soft-deletes evidence on checks rejected before `rejected_before`. A rejected check changes
        only when it reopens (and leaves `rejected`), so its updated_at is when it was rejected."""
        rejected = select(VerificationItem.id).where(
            VerificationItem.status == VerificationStatus.rejected,
            VerificationItem.updated_at < rejected_before,
        )
        result = await self.session.execute(
            update(VerificationDocument)
            .where(VerificationDocument.deleted_at.is_(None), VerificationDocument.item_id.in_(rejected))
            .values(deleted_at=now)
        )
        return int(getattr(result, "rowcount", 0) or 0)

    async def idle_workers(self, idle_before: datetime) -> list[Worker]:
        """Unlisted workers with evidence on file, no active placement, and nothing happening to them (no
        edit, no placement starting or ending) since `idle_before`. Locked; busy rows are skipped."""
        last_placement = (
            select(func.max(func.coalesce(Placement.ended_at, Placement.created_at)))
            .where(Placement.worker_id == Worker.id)
            .scalar_subquery()
        )
        active = select(Placement.id).where(Placement.worker_id == Worker.id, Placement.status.in_(ACTIVE))
        evidence = (
            select(VerificationDocument.id)
            .join(VerificationItem, VerificationItem.id == VerificationDocument.item_id)
            .where(VerificationItem.worker_id == Worker.id, VerificationDocument.deleted_at.is_(None))
        )
        rows = await self.session.scalars(
            select(Worker)
            .where(
                Worker.listing_status != ListingStatus.listed,
                ~active.exists(),
                evidence.exists(),
                func.greatest(Worker.updated_at, func.coalesce(last_placement, Worker.updated_at))
                < idle_before,
            )
            .with_for_update(of=Worker, skip_locked=True)
        )
        return list(rows)

    async def delete_worker_evidence(self, worker_id: uuid.UUID, now: datetime) -> int:
        """Soft-deletes all of a worker's evidence and sends its verified checks to `expired`, so the worker
        can only be listed again after fresh evidence is checked (rule 1)."""
        items = select(VerificationItem.id).where(VerificationItem.worker_id == worker_id)
        result = await self.session.execute(
            update(VerificationDocument)
            .where(VerificationDocument.deleted_at.is_(None), VerificationDocument.item_id.in_(items))
            .values(deleted_at=now)
        )
        await self.session.execute(
            update(VerificationItem)
            .where(
                VerificationItem.worker_id == worker_id,
                VerificationItem.status == VerificationStatus.verified,
            )
            .values(status=VerificationStatus.expired, verified_at=None, verified_by=None, expires_at=None)
        )
        return int(getattr(result, "rowcount", 0) or 0)

    async def unpurged_documents(self, limit: int) -> list[VerificationDocument]:
        """Deleted evidence still in Cloudinary, oldest first."""
        rows = await self.session.scalars(
            select(VerificationDocument)
            .where(VerificationDocument.deleted_at.is_not(None), VerificationDocument.purged_at.is_(None))
            .order_by(VerificationDocument.deleted_at)
            .limit(limit)
        )
        return list(rows)

    async def mark_purged(self, document_id: uuid.UUID, now: datetime) -> None:
        await self.session.execute(
            update(VerificationDocument).where(VerificationDocument.id == document_id).values(purged_at=now)
        )
