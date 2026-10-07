"""Payment and webhook-event queries."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.modules.payments.models import Payment, PaymentKind, PaymentStatus, WebhookEvent


class PaymentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, payment: Payment) -> Payment:
        self.session.add(payment)
        await self.session.flush()
        await self.session.refresh(payment)
        return payment

    async def get(self, payment_id: uuid.UUID, *, for_update: bool = False) -> Payment | None:
        query = select(Payment).where(Payment.id == payment_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def by_reference(self, reference: str, *, for_update: bool = False) -> Payment | None:
        query = select(Payment).where(Payment.paystack_reference == reference)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def pending_fee(self, placement_id: uuid.UUID, *, for_update: bool = False) -> Payment | None:
        query = select(Payment).where(
            Payment.placement_id == placement_id,
            Payment.kind == PaymentKind.placement_fee,
            Payment.status == PaymentStatus.pending,
        )
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def fail_pending_fee(self, placement_id: uuid.UUID) -> None:
        """The hold ended unpaid; its checkout no longer counts (a late payment is refunded)."""
        await self.session.execute(
            update(Payment)
            .where(
                Payment.placement_id == placement_id,
                Payment.kind == PaymentKind.placement_fee,
                Payment.status == PaymentStatus.pending,
            )
            .values(status=PaymentStatus.failed)
        )

    async def page_for(
        self, user_id: uuid.UUID, agency_id: uuid.UUID | None, params: PageParams
    ) -> tuple[list[Payment], int]:
        """The caller's own payments, plus their agency's (subscriptions), newest first."""
        scope = (
            or_(Payment.payer_user_id == user_id, Payment.agency_id == agency_id)
            if agency_id
            else (Payment.payer_user_id == user_id)
        )
        rows = await self.session.scalars(
            select(Payment)
            .where(scope)
            .order_by(Payment.created_at.desc(), Payment.id)
            .offset(params.offset)
            .limit(params.page_size)
        )
        total = await self.session.scalar(select(func.count()).select_from(Payment).where(scope)) or 0
        return list(rows), total

    async def fees_paid_since(self, since: datetime) -> int:
        return (
            await self.session.scalar(
                select(func.coalesce(func.sum(Payment.amount_kobo), 0)).where(
                    Payment.kind == PaymentKind.placement_fee,
                    Payment.status == PaymentStatus.success,
                    Payment.paid_at >= since,
                )
            )
            or 0
        )


class WebhookEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record(
        self, provider: str, event_id: str, event_type: str, payload: dict[str, Any]
    ) -> WebhookEvent:
        """Inserts the event once; a redelivery returns the stored row (UNIQUE provider, event_id)."""
        await self.session.execute(
            insert(WebhookEvent)
            .values(provider=provider, event_id=event_id, event_type=event_type, payload=payload)
            .on_conflict_do_nothing(constraint="uq_webhook_events_provider_event_id")
        )
        stored = await self.session.scalar(
            select(WebhookEvent)
            .where(WebhookEvent.provider == provider, WebhookEvent.event_id == event_id)
            .with_for_update()
        )
        assert stored is not None  # noqa: S101  # inserted or already there
        return stored
