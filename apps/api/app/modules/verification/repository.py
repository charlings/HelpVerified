"""Checks, documents and the document access log."""

import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationFailed
from app.modules.verification.models import (
    KINDS,
    DocumentAccess,
    VerificationDocument,
    VerificationItem,
    VerificationKind,
    VerificationStatus,
)
from app.modules.workers.models import Worker


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

    async def expire_lapsed(self, now: datetime) -> int:
        """Verified checks past expires_at become `expired`; the trigger then delists their workers."""
        result = await self.session.execute(
            update(VerificationItem)
            .where(
                VerificationItem.status == VerificationStatus.verified,
                VerificationItem.expires_at.is_not(None),
                VerificationItem.expires_at <= now,
            )
            .values(status=VerificationStatus.expired)
        )
        return int(getattr(result, "rowcount", 0) or 0)
